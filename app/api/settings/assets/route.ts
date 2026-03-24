import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { brandAssets, teams, teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { uploadFile, deleteFile, ensureBucket } from '@/lib/storage';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const DESCRIBE_MAX_PX = 512; // max dimension for the thumbnail sent to LLM

export async function getUserTeamId(userId: string): Promise<string | null> {
  const ownedTeam = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.ownerId, userId))
    .limit(1);

  if (ownedTeam.length > 0) return ownedTeam[0].id;

  const membership = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  return membership.length > 0 ? membership[0].teamId : null;
}

/** Ensure the user has a team, lazily creating one if needed. Returns teamId. */
export async function getOrCreateTeamId(userId: string): Promise<string> {
  const existing = await getUserTeamId(userId);
  if (existing) return existing;

  const { users } = await import('@/lib/db/schema');
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const teamName = user[0]?.name ? `${user[0].name}'s Team` : 'My Team';
  const [newTeam] = await db
    .insert(teams)
    .values({ name: teamName, ownerId: userId })
    .returning();
  return newTeam.id;
}

/** Resize an image buffer to at most DESCRIBE_MAX_PX on the longest side, return as JPEG base64. */
async function resizeForLLM(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (!mimeType.startsWith('image/')) return null;
  try {
    const resized = await sharp(buffer)
      .resize(DESCRIBE_MAX_PX, DESCRIBE_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return resized.toString('base64');
  } catch {
    return null;
  }
}

/** Call the OpenRouter LLM to generate a short description for the asset. */
async function generateDescription(title: string, base64Jpeg: string | null): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return '';

  const modelId = (process.env.OPENROUTER_MODEL || '').trim() || 'google/gemini-2.5-flash';

  const messages: any[] = [
    {
      role: 'user',
      content: base64Jpeg
        ? [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` },
          },
          {
            type: 'text',
            text: `Write a concise 1-2 sentence description for this design asset titled "${title}". Focus on what it depicts and how it might be used in design work. Reply with just the description, no preamble.`,
          },
        ]
        : [
          {
            type: 'text',
            text: `Write a concise 1-2 sentence description for a design asset titled "${title}". Focus on what it likely contains and how it might be used in design work. Reply with just the description, no preamble.`,
          },
        ],
    },
  ];

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelId, messages, max_tokens: 100 }),
    });
    if (!res.ok) return '';
    const json = await res.json();
    return (json.choices?.[0]?.message?.content ?? '').trim();
  } catch {
    return '';
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId) return NextResponse.json([]);

    const teamAssets = await db
      .select()
      .from(brandAssets)
      .where(eq(brandAssets.teamId, teamId))
      .orderBy(brandAssets.createdAt);

    return NextResponse.json(teamAssets.filter((asset) => asset.source !== 'generated'));
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await getOrCreateTeamId(session.user.id);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const source = (formData.get('source') as string | null) ?? 'uploaded';

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    if (!title) return Response.json({ error: 'Title required' }, { status: 400 });

    const allowed = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/webm',
    ];
    if (!allowed.includes(file.type)) {
      return Response.json({ error: 'Only images, PDF, video, and audio files are allowed' }, { status: 400 });
    }

    await ensureBucket();

    const ext = file.name.split('.').pop() ?? 'bin';
    const key = `assets/${teamId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileUrl = await uploadFile(key, buffer, file.type);

    // Generate description: resize image first to save tokens, then ask LLM
    const base64Jpeg = await resizeForLLM(buffer, file.type);
    const description = await generateDescription(title, base64Jpeg);

    const [asset] = await db
      .insert(brandAssets)
      .values({
        teamId,
        uploadedBy: session.user.id,
        title,
        description,
        fileKey: key,
        fileUrl,
        mimeType: file.type,
        source: ['uploaded', 'chat'].includes(source) ? source : 'uploaded',
      })
      .returning();

    return NextResponse.json(asset);
  } catch (error) {
    console.error('Error uploading asset:', error);
    return NextResponse.json({ error: 'Failed to upload asset' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('id');
    if (!assetId) return Response.json({ error: 'Asset ID required' }, { status: 400 });

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId) return Response.json({ error: 'No team found' }, { status: 404 });

    const asset = await db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.id, assetId), eq(brandAssets.teamId, teamId)))
      .limit(1);

    if (!asset.length) return Response.json({ error: 'Asset not found' }, { status: 404 });

    await deleteFile(asset[0].fileKey);
    await db.delete(brandAssets).where(eq(brandAssets.id, assetId));

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
