import { tool } from 'ai';
import { z } from 'zod';
import {
  saveVideoMessage,
  getVideoById,
  createPendingVideoVersion,
  updateVideoVersionContent,
  updateVideoVersionUsage,
} from '@/lib/db/entities-service';
import { createEntityChatHandler } from '@/lib/chat/entity-chat-handler';

export const maxDuration = 60;

const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
const ALLOWED_MODELS = [
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite-preview',
  'google/gemini-3.1-pro-preview',
];

function findNativeVideoTag(remotionCode: string): string | null {
  if (/<video[\s>]/gi.test(remotionCode)) return 'native <video> tag';
  if (/<Video[\s/>]/g.test(remotionCode)) return '<Video> component (Html5Video)';
  return null;
}

function findInvalidImageSource(remotionCode: string) {
  const imageSourceRegex = /<img[^>]+src=["'`]([^"'`]+)["'`]/gi;
  let match: RegExpExecArray | null;
  while ((match = imageSourceRegex.exec(remotionCode)) !== null) {
    const src = match[1]?.trim();
    if (!src) continue;
    if (src.startsWith('data:') || src.startsWith('blob:')) continue;
    const isPexels = src.includes('images.pexels.com') || src.includes('videos.pexels.com') || src.includes('player.vimeo.com');
    if (isPexels) continue;
    if (src.startsWith('http://localhost') || src.startsWith('https://localhost') || src.startsWith('http://127.0.0.1') || src.startsWith('https://127.0.0.1') || src.includes('/api/assets/') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) {
      return src;
    }
  }
  return null;
}

export const POST = createEntityChatHandler({
  entityIdParam: 'videoId',
  defaultModel: DEFAULT_MODEL,
  allowedModels: ALLOWED_MODELS,
  envModelKeys: ['VIDEO_MODEL'],
  maxSteps: 3,
  messageConversionMode: 'image-aware',
  messageConversionLabel: 'video',
  loadEntity: getVideoById,
  createPendingVersion: createPendingVideoVersion,
  markVersionError: async (versionId) => {
    const { updateVideoVersion } = await import('@/lib/db/entities-service');
    await updateVideoVersion(versionId, { status: 'error' });
  },
  saveMessage: saveVideoMessage,
  updateVersionUsage: updateVideoVersionUsage,
  buildSystemPrompt: ({ chainContext, entity }) => {
    const videoContext = entity
      ? `Current video settings: ${(entity as any).width}x${(entity as any).height}, ${(entity as any).durationInFrames} frames at ${(entity as any).fps} fps (${((entity as any).durationInFrames / (entity as any).fps).toFixed(1)}s)`
      : 'No video configured yet. The user will provide dimensions and duration.';

    return [
      `You are an expert Remotion video developer. Your job is to create stunning, production-quality Remotion video compositions for the user.${chainContext}`,
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
      'You have access to Pexels stock media:',
      '- Use `searchPexelsVideos` to find stock video clips by keyword',
      '- Use `searchPexelsImages` to find stock photos/images by keyword',
      '- Pexels video URLs MUST be used in Remotion <OffthreadVideo> components (NOT <Video> or native <video> tags)',
      '- Pexels image URLs MUST be used in Remotion <Img> components (NOT native <img> tags)',
      '- Always attribute Pexels in a comment in the code when using their media',
      '',
      'When generating or editing Remotion code:',
      '1. If the user wants to EDIT or MODIFY the existing video, first call `getVideo` to retrieve the current code, then make the requested changes and call `saveVideo` with the updated code.',
      '2. If the user wants to CREATE a new video from scratch, call `saveVideo` directly with the new code.',
      '3. Use the `saveVideo` tool to save the Remotion component code — each save automatically creates a new version.',
      '4. The code should be a complete React component named `MainComposition`',
      "5. Import only from 'remotion' (the package will be available)",
      '6. Use inline styles — no external CSS files',
      '7. Create visually impressive animations with smooth easing',
      '',
      'When the user references uploaded or tagged assets:',
      '- NEVER use http://localhost, 127.0.0.1, /api/..., or any remote URL inside an <img src> for the final Remotion code.',
      '- If you need to show a referenced logo or graphic, inline it as a data URI or recreate it directly in JSX or SVG.',
      '',
      'CRITICAL RULES:',
      "- ONLY import from 'remotion' — no other external packages",
      '- Use only inline styles (no className, no Tailwind, no CSS files)',
      '- The component MUST be named `MainComposition` and exported as named export',
      '- Do NOT include any JSX pragma or React import (React is available globally)',
      '- Do NOT call `registerRoot` or `Composition` — just export the component',
      '',
      'ANTI-FLICKERING RULES (critical for correct video rendering):',
      '- ALL animations MUST be derived purely from `useCurrentFrame()`. Never use CSS animations, CSS transitions, `setTimeout`, `setInterval`, `requestAnimationFrame`, or any time-based state.',
      '- ALWAYS use `<OffthreadVideo>` for video content — NEVER use `<Video>` (Html5Video) or native `<video>` HTML tags.',
      '- ALWAYS use `<Img>` from remotion for images — NEVER use native `<img>` HTML tags.',
      '- NEVER use CSS `background-image` with external URLs.',
      '- NEVER use `Math.random()` or any non-deterministic values — use `random()` from remotion with a stable seed instead.',
      '',
      'After saving, briefly describe what you created.',
    ].join('\n');
  },
  buildTools: ({ entityId, tracker, userPrompt, parentVersionId, modelId, entity }) => {
    const parentVersion = parentVersionId ? entity?.versions.find(v => v.id === parentVersionId) : undefined;
    const parentRemotionCode: string | undefined = (parentVersion as any)?.remotionCode;

    return {
      saveVideo: tool({
        description: 'Save the Remotion composition code. This updates the video preview.',
        inputSchema: z.object({
          remotionCode: z.string().describe('The complete Remotion React component code'),
          title: z.string().optional().describe('Short title for the video'),
          width: z.number().optional().describe('Video width in pixels'),
          height: z.number().optional().describe('Video height in pixels'),
          durationInFrames: z.number().optional().describe('Total duration in frames'),
          fps: z.number().optional().describe('Frames per second'),
        }),
        execute: async ({ remotionCode, title, width, height, durationInFrames, fps }: {
          remotionCode: string; title?: string; width?: number; height?: number; durationInFrames?: number; fps?: number;
        }) => {
          try {
            const invalidImageSource = findInvalidImageSource(remotionCode);
            if (invalidImageSource) {
              return { success: false, error: `Invalid image source in Remotion code: ${invalidImageSource}. Do not use localhost, /api asset routes, or any remote URL in <img src>. Inline the asset as a data URI or SVG markup instead.` };
            }
            const invalidVideoTag = findNativeVideoTag(remotionCode);
            if (invalidVideoTag) {
              return { success: false, error: `Flickering-prone video tag detected: ${invalidVideoTag}. Always use <OffthreadVideo> from 'remotion' for video backgrounds and overlays.` };
            }
            await updateVideoVersionContent(tracker.currentVersionId, { remotionCode, title, width, height, durationInFrames, fps });
            tracker.contentSaved = true;
            return { success: true, message: 'Video code saved. The video will be available to render.' };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
      getVideo: tool({
        description: 'Get the current Remotion code so you can modify or improve it.',
        inputSchema: z.object({}),
        execute: async () => {
          const video = await getVideoById(entityId);
          if (!video) return { success: false, error: 'No video yet' };
          const remotionCode = parentRemotionCode ?? video.remotionCode;
          return { success: true, remotionCode, title: video.title, width: video.width, height: video.height, durationInFrames: video.durationInFrames, fps: video.fps };
        },
      }),
      searchPexelsVideos: tool({
        description: 'Search for stock videos on Pexels to use in the video composition.',
        inputSchema: z.object({
          query: z.string().describe('Search query for finding relevant stock videos'),
          count: z.number().min(1).max(10).optional().describe('Number of results to return (default: 5, max: 10)'),
        }),
        execute: async ({ query, count = 5 }: { query: string; count?: number }) => {
          const apiKey = process.env.PEXELS_API_KEY;
          if (!apiKey) return { success: false, error: 'Pexels API key not configured' };
          try {
            const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 10)}`;
            const res = await fetch(url, { headers: { Authorization: apiKey } });
            if (!res.ok) return { success: false, error: `Pexels API error: ${res.status}` };
            const data = await res.json() as any;
            const videos = (data.videos || []).map((v: any) => {
              const bestFile = (v.video_files || []).filter((f: any) => f.file_type === 'video/mp4').sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
              return { id: v.id, url: bestFile?.link || null, width: bestFile?.width || v.width, height: bestFile?.height || v.height, duration: v.duration, thumbnail: v.image, photographer: v.user?.name, pexelsUrl: v.url };
            }).filter((v: any) => v.url);
            return { success: true, videos };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
      searchPexelsImages: tool({
        description: 'Search for stock photos/images on Pexels to use in the video composition.',
        inputSchema: z.object({
          query: z.string().describe('Search query for finding relevant stock images'),
          count: z.number().min(1).max(10).optional().describe('Number of results to return (default: 5, max: 10)'),
        }),
        execute: async ({ query, count = 5 }: { query: string; count?: number }) => {
          const apiKey = process.env.PEXELS_API_KEY;
          if (!apiKey) return { success: false, error: 'Pexels API key not configured' };
          try {
            const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 10)}`;
            const res = await fetch(url, { headers: { Authorization: apiKey } });
            if (!res.ok) return { success: false, error: `Pexels API error: ${res.status}` };
            const data = await res.json() as any;
            const images = (data.photos || []).map((p: any) => ({ id: p.id, url: p.src?.original || null, largeUrl: p.src?.large2x || p.src?.large || null, mediumUrl: p.src?.medium || null, width: p.width, height: p.height, photographer: p.photographer, alt: p.alt, pexelsUrl: p.url }));
            return { success: true, images };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
    };
  },
});
