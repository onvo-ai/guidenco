import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getVideoMessages, saveVideoMessage, upsertProjectVideo, getProjectVideo } from '@/lib/db/projects-service';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) return new Response('Project ID required', { status: 400 });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === 'user') {
    await saveVideoMessage(projectId, 'user', lastUserMessage.parts || []);
  }

  // Load current video settings for context
  const currentVideo = await getProjectVideo(projectId);

  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const modelId = (process.env.OPENROUTER_MODEL || '').trim() || 'google/gemini-2.5-pro';

  const convertedMessages = messages.map((msg: any) => {
    const textParts = (msg.parts || [])
      .filter((p: any) => p.type === 'text')
      .map((p: any) => ({ type: 'text' as const, text: p.text }));
    return {
      role: msg.role,
      content: textParts.length > 0 ? textParts : [{ type: 'text' as const, text: '' }],
    };
  });

  const videoContext = currentVideo
    ? `Current video settings: ${currentVideo.width}x${currentVideo.height}, ${currentVideo.durationInFrames} frames at ${currentVideo.fps} fps (${(currentVideo.durationInFrames / currentVideo.fps).toFixed(1)}s)`
    : 'No video configured yet. The user will provide dimensions and duration.';

  const result = streamText({
    model: openrouter(modelId),
    messages: convertedMessages as any,
    stopWhen: stepCountIs(3),
    system: `You are an expert Remotion video developer. Your job is to create stunning, production-quality Remotion video compositions for the user.

${videoContext}

You generate Remotion React component code. Remotion videos are React components that use:
- \`useCurrentFrame()\` to get the current frame number
- \`useVideoConfig()\` to get { width, height, fps, durationInFrames }
- \`interpolate(frame, [from, to], [fromValue, toValue])\` for smooth animations
- \`spring({ frame, fps, config })\` for spring animations
- \`Sequence\` for composing sub-components with timing
- \`AbsoluteFill\` for full-canvas layers
- Standard CSS-in-JS for styling (inline styles or CSS modules)

When generating Remotion code:
1. Use the \`saveVideo\` tool to save the Remotion component code
2. The code should be a complete React component named \`MainComposition\`
3. Import only from 'remotion' (the package will be available)
4. Use inline styles — no external CSS files
5. Create visually impressive animations with smooth easing
6. Think about: text animations, shape morphing, color transitions, particle effects, etc.

Code format expected:
\`\`\`tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';

export const MainComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Your animation logic here

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Your animation content */}
    </AbsoluteFill>
  );
};
\`\`\`

CRITICAL RULES:
- ONLY import from 'remotion' — no other external packages
- Use only inline styles (no className, no Tailwind, no CSS files)
- The component MUST be named \`MainComposition\` and exported as named export
- Do NOT include any JSX pragma or React import (React is available globally)
- Do NOT call \`registerRoot\` or \`Composition\` — just export the component

After saving, briefly describe what you created.`,
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
            await upsertProjectVideo(projectId, {
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
          const video = await getProjectVideo(projectId);
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
    onStepFinish: async ({ text, toolCalls, toolResults }) => {
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
        if (parts.length > 0) await saveVideoMessage(projectId, 'assistant', parts);
      } catch (e) {
        console.error('Error saving video message:', e);
      }
    },
  });

  return result.toDataStreamResponse();
}
