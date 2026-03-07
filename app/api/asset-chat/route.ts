import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { saveAssetMessage, upsertAsset, getAssetById } from '@/lib/db/entities-service';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const maxDuration = 60;
const DEFAULT_SVG_MODEL = 'google/gemini-2.5-pro';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId');

    if (!assetId) return new Response('Asset ID required', { status: 400 });

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return new Response('Unauthorized', { status: 401 });

    const { messages }: { messages: UIMessage[] } = await req.json();

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === 'user') {
      await saveAssetMessage(assetId, 'user', lastUserMessage.parts || []);
    }

    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) {
      return new Response('OPENROUTER_API_KEY is not configured.', { status: 500 });
    }

    const openrouter = createOpenRouter({ apiKey });
    const configuredSvgModel = (process.env.SVG_MODEL || '').trim();
    const configuredDefaultModel = (process.env.OPENROUTER_MODEL || '').trim();
    const selectedConfiguredModel = configuredSvgModel || configuredDefaultModel;
    const modelId = selectedConfiguredModel.includes('preview') ? DEFAULT_SVG_MODEL : (selectedConfiguredModel || DEFAULT_SVG_MODEL);
    const currentAsset = await getAssetById(assetId);

    const convertedMessages = messages.map((msg: any) => {
      const textParts = (msg.parts || [])
        .filter((p: any) => p.type === 'text')
        .map((p: any) => ({ type: 'text' as const, text: p.text }));
      return {
        role: msg.role,
        content: textParts.length > 0 ? textParts : [{ type: 'text' as const, text: '' }],
      };
    });

    const result = streamText({
      model: openrouter(modelId),
      messages: convertedMessages as any,
      stopWhen: currentAsset ? stepCountIs(3) : stepCountIs(1),
      ...(currentAsset
        ? {}
        : {
          activeTools: ['saveSVG'],
          toolChoice: { type: 'tool' as const, toolName: 'saveSVG' as const },
        }),
      system: `You are an expert SVG designer. Your job is to create high-quality, standalone SVG assets for the user.

Guidelines:
- Always output a complete, valid, self-contained SVG (starting with <svg ...> and ending with </svg>)
- Use viewBox for scalability (e.g., viewBox="0 0 200 200")
- Include explicit width and height attributes appropriate for the asset
- Use clean, semantic SVG with paths, shapes, gradients, and text as needed
- Create visually polished, professional-looking assets
- Logos, icons, illustrations, badges, decorative elements — anything vector
- Use gradients, masks, filters, and other SVG features to create rich visuals
- Do NOT include any HTML wrapper, just the raw SVG markup

When a user asks you to create or modify an SVG asset:
1. Use the saveSVG tool to save the SVG content — this updates the preview immediately
2. Always call saveSVG with the complete SVG code
3. Provide a brief description of what you created after saving

If the user asks to modify or improve the asset, use getSVG to see the current SVG first, then save an updated version.

CRITICAL: Always end with a text explanation of what you created/changed.`,
      tools: {
        saveSVG: tool({
          description: 'Save the generated SVG asset. This immediately updates the preview.',
          inputSchema: z.object({
            svgContent: z.string().describe('The complete SVG markup starting with <svg and ending with </svg>'),
            title: z.string().optional().describe('Short title for the asset (e.g., "Company Logo", "Star Icon")'),
          }),
          execute: async ({ svgContent, title }: { svgContent: string; title?: string }) => {
            try {
              await upsertAsset(assetId, { svgContent, title, createVersion: true });
              return { success: true, message: 'SVG saved successfully' };
            } catch (error: any) {
              console.error('Error saving SVG asset:', error);
              return { success: false, error: error.message };
            }
          },
        }),
        getSVG: tool({
          description: 'Get the current SVG asset content so you can modify or improve it.',
          inputSchema: z.object({}),
          execute: async () => {
            const asset = await getAssetById(assetId);
            if (!asset) return { success: false, error: 'No SVG asset yet' };

            const image = `data:image/svg+xml;base64,${Buffer.from(asset.svgContent).toString('base64')}`;

            return {
              success: true,
              title: asset.title || 'Current SVG Asset',
              image,
              mimeType: 'image/svg+xml',
              message: asset.title ? `Inspecting asset: ${asset.title}` : 'Inspecting current asset...',
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
          if (parts.length > 0) await saveAssetMessage(assetId, 'assistant', parts);
        } catch (e) {
          console.error('Error saving asset message:', e);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Asset chat route failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown asset chat error';
    return new Response(`Asset chat failed: ${message}`, { status: 500 });
  }
}
