import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { brandAssets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getFileBuffer } from "@/lib/storage";
import sharp from "sharp";
import { getUserTeamId } from "@/app/api/settings/assets/route";

const MENTION_MAX_PX = 512;

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("id");
    if (!assetId)
      return Response.json({ error: "Asset ID required" }, { status: 400 });

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId)
      return Response.json({ error: "No team found" }, { status: 403 });

    const [asset] = await db
      .select()
      .from(brandAssets)
      .where(
        and(
          eq(brandAssets.id, assetId),
          eq(brandAssets.organizationId, teamId),
        ),
      )
      .limit(1);

    if (!asset)
      return Response.json({ error: "Asset not found" }, { status: 404 });
    if (!asset.mimeType.startsWith("image/")) {
      return Response.json({ error: "Not an image asset" }, { status: 400 });
    }

    const buffer = await getFileBuffer(asset.fileKey);
    const resized = await sharp(buffer)
      .resize(MENTION_MAX_PX, MENTION_MAX_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer();

    return Response.json({
      base64: resized.toString("base64"),
      mimeType: "image/jpeg",
      title: asset.title,
    });
  } catch (error) {
    console.error("Error fetching asset data:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset data" },
      { status: 500 },
    );
  }
}
