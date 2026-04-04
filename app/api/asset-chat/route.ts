import { tool } from 'ai';
import { z } from 'zod';
import {
  saveAssetMessage,
  getAssetById,
  createPendingAssetVersion,
  updateAssetVersionContent,
  updateAssetVersionStatus,
  updateAssetVersionUsage,
} from '@/lib/db/entities-service';
import { createEntityChatHandler } from '@/lib/chat/entity-chat-handler';

export const maxDuration = 60;

const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
const ALLOWED_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-3.1-pro-preview",
];

export const POST = createEntityChatHandler({
  entityIdParam: 'assetId',
  defaultModel: DEFAULT_MODEL,
  allowedModels: ALLOWED_MODELS,
  envModelKeys: ['SVG_MODEL'],
  maxSteps: (entity) => (entity && entity.currentVersion >= 0 ? 3 : 1),
  getStreamOverrides: (entity) => {
    if (!entity || entity.currentVersion < 0) {
      return {
        activeTools: ['saveSVG'],
        toolChoice: { type: 'tool' as const, toolName: 'saveSVG' as const },
      };
    }
    return {};
  },
  messageConversionMode: 'file-aware',
  loadEntity: getAssetById,
  createPendingVersion: createPendingAssetVersion,
  markVersionError: (versionId) => updateAssetVersionStatus(versionId, 'error'),
  saveMessage: saveAssetMessage,
  updateVersionUsage: updateAssetVersionUsage,
  buildSystemPrompt: ({ chainContext }) => `You are an expert SVG designer. Your job is to create high-quality, standalone SVG assets for the user.${chainContext}

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
  buildTools: ({ entityId, tracker, userPrompt, parentVersionId, modelId, entity }) => {
    const parentVersion = parentVersionId ? entity?.versions.find(v => v.id === parentVersionId) : undefined;
    const parentSvgContent: string | undefined = (parentVersion as any)?.svgContent;

    return {
      saveSVG: tool({
        description: 'Save the generated SVG asset. This immediately updates the preview.',
        inputSchema: z.object({
          svgContent: z.string().describe('The complete SVG markup starting with <svg and ending with </svg>'),
          title: z.string().optional().describe('Short title for the asset (e.g., "Company Logo", "Star Icon")'),
        }),
        execute: async ({ svgContent, title }: { svgContent: string; title?: string }) => {
          try {
            await updateAssetVersionContent(tracker.currentVersionId, { svgContent, title });
            tracker.contentSaved = true;
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
          const svgContent = parentSvgContent ?? (entity?.versions[entity.currentVersion] as any)?.svgContent as string | undefined;
          if (!svgContent) return { success: false, error: 'No SVG asset yet' };
          const image = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
          return { success: true, title: 'Current SVG Asset', image, mimeType: 'image/svg+xml', message: 'Inspecting current asset...' };
        },
      }),
    };
  },
});
