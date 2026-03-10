import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getVideoMessages, saveVideoMessage, upsertVideo, getVideoById } from '@/lib/db/entities-service';
import { resizeImage } from '@/lib/image-processing';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getUserCredits, deductCredit } from '@/lib/billing';

export const maxDuration = 60;

function toDataUri(image: string, mimeType: string) {
  if (!image) return image;
  return image.startsWith('data:') ? image : `data:${mimeType};base64,${image}`;
}

function findInvalidImageSource(remotionCode: string) {
  const imageSourceRegex = /<img[^>]+src=["'`]([^"'`]+)["'`]/gi;
  let match: RegExpExecArray | null;

  while ((match = imageSourceRegex.exec(remotionCode)) !== null) {
    const src = match[1]?.trim();
    if (!src) continue;
    if (src.startsWith('data:') || src.startsWith('blob:')) continue;

    if (
      src.startsWith('http://localhost')
      || src.startsWith('https://localhost')
      || src.startsWith('http://127.0.0.1')
      || src.startsWith('https://127.0.0.1')
      || src.includes('/api/assets/')
      || src.startsWith('http://')
      || src.startsWith('https://')
      || src.startsWith('/')
    ) {
      return src;
    }
  }

  return null;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) return new Response('Video ID required', { status: 400 });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response('Unauthorized', { status: 401 });

  // Credit check — reject before touching the LLM
  const creditBalance = await getUserCredits(session.user.id);
  if (creditBalance <= 0) {
    return new Response('Insufficient credits', { status: 402 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === 'user') {
    await saveVideoMessage(videoId, 'user', lastUserMessage.parts || []);
  }

  // Load current video settings for context
  const currentVideo = await getVideoById(videoId);

  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const modelId = (process.env.OPENROUTER_MODEL || '').trim() || 'google/gemini-2.5-pro';

  const convertedMessages = await Promise.all(messages.map(async (msg: any) => {
    const content: any[] = [];

    for (const part of msg.parts || []) {
      if (part.type === 'text') {
        content.push({ type: 'text' as const, text: part.text });
        continue;
      }

      if (part.type !== 'image') {
        continue;
      }

      const mimeType = part.mimeType || 'image/png';

      if (mimeType === 'image/svg+xml') {
        content.push({
          type: 'text' as const,
          text: part.fileUrl
            ? `[SVG reference provided for the video. Use this asset URL if you need a source reference: ${part.fileUrl}]`
            : '[SVG reference provided in video chat context. Treat it as a referenced vector asset rather than an inline vision image.]',
        });

        if (typeof part.image === 'string' && part.image.length > 0) {
          content.push({
            type: 'text' as const,
            text: `[SVG content preview]\n\n${part.image.slice(0, 4000)}`,
          });
        }

        continue;
      }

      let imageContent = toDataUri(part.image, mimeType);
      try {
        imageContent = await resizeImage(imageContent);
      } catch (e) {
        console.error('Failed to resize video reference image:', e);
      }

      content.push({
        type: 'image' as const,
        image: imageContent,
        mimeType,
      });

      if (part.fileUrl) {
        content.push({
          type: 'text' as const,
          text: `[Referenced asset for this video is available at ${part.fileUrl}. If you use an <img> in Remotion, prefer a self-contained data URI over an external URL to avoid broken renders.]`,
        });
      }
    }

    return {
      role: msg.role,
      content: content.length > 0 ? content : [{ type: 'text' as const, text: '' }],
    };
  }));

  const videoContext = currentVideo
    ? `Current video settings: ${currentVideo.width}x${currentVideo.height}, ${currentVideo.durationInFrames} frames at ${currentVideo.fps} fps (${(currentVideo.durationInFrames / currentVideo.fps).toFixed(1)}s)`
    : 'No video configured yet. The user will provide dimensions and duration.';

  const systemPrompt = [
    'You are an expert Remotion video developer. Your job is to create stunning, production-quality Remotion video compositions for the user.',
    '',
    videoContext,
    '',
    'You generate Remotion React component code. Remotion videos are React components that use:',
    '- `useCurrentFrame()` to get the current frame number',
    '- `useVideoConfig()` to get { width, height, fps, durationInFrames }',
    '- `interpolate(frame, [from, to], [fromValue, toValue])` for smooth animations',
    '- `spring({ frame, fps, config })` for spring animations',
    '- `Sequence` for composing sub-components with timing',
    '- `AbsoluteFill` for full-canvas layers',
    '- Standard CSS-in-JS for styling (inline styles or CSS modules)',
    '',
    'When generating Remotion code:',
    '1. Use the `saveVideo` tool to save the Remotion component code',
    '2. The code should be a complete React component named `MainComposition`',
    "3. Import only from 'remotion' (the package will be available)",
    '4. Use inline styles — no external CSS files',
    '5. Create visually impressive animations with smooth easing',
    '6. Think about: text animations, shape morphing, color transitions, particle effects, etc.',
    '',
    'When the user references uploaded or tagged assets:',
    '- You may receive image inputs and reference URLs in chat context.',
    '- For logos and static artwork, prefer embedding a provided data URI directly in the Remotion code rather than depending on a remote URL.',
    '- Do not assume an external asset URL will render reliably at video render time.',
    '- NEVER use http://localhost, 127.0.0.1, /api/..., or any remote URL inside an <img src> for the final Remotion code.',
    '- If you need to show a referenced logo or graphic, inline it as a data URI or recreate it directly in JSX or SVG.',
    '',
    'Code format expected:',
    '```tsx',
    "import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';",
    '',
    'export const MainComposition: React.FC = () => {',
    '  const frame = useCurrentFrame();',
    '  const { fps, durationInFrames, width, height } = useVideoConfig();',
    '',
    '  return (',
    "    <AbsoluteFill style={{ backgroundColor: '#000' }}>",
    '    </AbsoluteFill>',
    '  );',
    '};',
    '```',
    '',
    'CRITICAL RULES:',
    "- ONLY import from 'remotion' — no other external packages",
    '- Use only inline styles (no className, no Tailwind, no CSS files)',
    '- The component MUST be named `MainComposition` and exported as named export',
    '- Do NOT include any JSX pragma or React import (React is available globally)',
    '- Do NOT call `registerRoot` or `Composition` — just export the component',
    '',
    'After saving, briefly describe what you created.',
  ].join('\n');

  const result = streamText({
    model: openrouter(modelId),
    messages: convertedMessages as any,
    stopWhen: stepCountIs(3),
    system: systemPrompt,
    tools: {
      saveVideo: tool({
        description: 'Save the Remotion composition code. This updates the video preview.',
        inputSchema: z.object({
          remotionCode: z.string().describe('The complete Remotion React component code'),
          title: z.string().optional().describe('Short title for the video (e.g., "Product Reveal", "Logo Intro")'),
          width: z.number().optional().describe('Video width in pixels (default: keep current or 1920)'),
          height: z.number().optional().describe('Video height in pixels (default: keep current or 1080)'),
          durationInFrames: z.number().optional().describe('Total duration in frames (default: keep current or 150)'),
          fps: z.number().optional().describe('Frames per second (default: keep current or 30)'),
        }),
        execute: async ({ remotionCode, title, width, height, durationInFrames, fps }: {
          remotionCode: string;
          title?: string;
          width?: number;
          height?: number;
          durationInFrames?: number;
          fps?: number;
        }) => {
          try {
            const invalidImageSource = findInvalidImageSource(remotionCode);
            if (invalidImageSource) {
              return {
                success: false,
                error: `Invalid image source in Remotion code: ${invalidImageSource}. Do not use localhost, /api asset routes, or any remote URL in <img src>. Inline the asset as a data URI or SVG markup instead.`,
              };
            }

            await upsertVideo(videoId, {
              remotionCode,
              ...(title && { title }),
              ...(width && { width }),
              ...(height && { height }),
              ...(durationInFrames && { durationInFrames }),
              ...(fps && { fps }),
              status: 'pending',
            });

            return { success: true, message: 'Remotion code saved. The video will be available to render.' };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
      getVideo: tool({
        description: 'Get the current Remotion code so you can modify or improve it.',
        inputSchema: z.object({}),
        execute: async () => {
          const video = await getVideoById(videoId);
          if (!video) return { success: false, error: 'No video yet' };

          return {
            success: true,
            remotionCode: video.remotionCode,
            title: video.title,
            width: video.width,
            height: video.height,
            durationInFrames: video.durationInFrames,
            fps: video.fps,
          };
        },
      }),
    },
    onStepFinish: async ({ text, toolCalls, toolResults, finishReason }) => {
      if (finishReason === 'stop' || finishReason === 'length') {
        await deductCredit(session.user.id).catch(() => {});
      }
      try {
        const parts: any[] = [];
        if (toolCalls && toolResults) {
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i] as any;
            const tr = toolResults[i] as any;
            parts.push({ type: `tool-${tc.toolName}`, toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.args, output: tr?.result || tr });
          }
        }
        if (text) parts.push({ type: 'text', text });
        if (parts.length > 0) await saveVideoMessage(videoId, 'assistant', parts);
      } catch (e) {
        console.error('Error saving video message:', e);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
