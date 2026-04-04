import { UIMessage } from 'ai';
import { resizeImage } from '@/lib/image-processing';

export type MessageConversionMode = 'image-aware' | 'text-only' | 'file-aware';

type ConvertedMessage = {
  role: string;
  content: Array<{ type: string; [key: string]: any }>;
};

function toDataUri(image: string, mimeType: string) {
  if (!image) return image;
  return image.startsWith('data:') ? image : `data:${mimeType};base64,${image}`;
}

/**
 * 'image-aware': handles text, image (with SVG special-casing and resize), and fileUrl context.
 * Used by document-chat and video-chat.
 */
async function convertImageAware(messages: UIMessage[], entityLabel: string): Promise<ConvertedMessage[]> {
  return Promise.all(messages.map(async (msg: any) => {
    const content: any[] = [];
    for (const part of msg.parts || []) {
      if (part.type === 'text') {
        content.push({ type: 'text', text: part.text });
      } else if (part.type === 'image') {
        const mimeType = part.mimeType || 'image/png';
        if (mimeType === 'image/svg+xml') {
          content.push({
            type: 'text',
            text: part.fileUrl
              ? `[SVG reference provided for the ${entityLabel}. Use this asset URL if needed: ${part.fileUrl}]`
              : `[SVG reference provided in ${entityLabel} chat context.]`,
          });
          if (typeof part.image === 'string' && part.image.length > 0) {
            content.push({ type: 'text', text: `[SVG content preview]\n\n${part.image.slice(0, 4000)}` });
          }
          continue;
        }
        let imageContent = toDataUri(part.image, mimeType);
        try { imageContent = await resizeImage(imageContent); } catch (e) { console.error('Failed to resize image:', e); }
        content.push({ type: 'image', image: imageContent, mimeType });
        if (part.fileUrl) {
          content.push({
            type: 'text',
            text: `[Image uploaded. Permanent URL: ${part.fileUrl}]`,
          });
        }
      }
    }
    return { role: msg.role, content: content.length > 0 ? content : [{ type: 'text', text: '' }] };
  }));
}

/**
 * 'file-aware': handles text and file parts (strips data URL prefix to get raw base64).
 * Used by asset-chat.
 */
function convertFileAware(messages: UIMessage[]): ConvertedMessage[] {
  return messages.map((msg: any) => {
    const contentParts: any[] = (msg.parts || []).flatMap((p: any) => {
      if (p.type === 'text') return [{ type: 'text' as const, text: p.text }];
      if (p.type === 'file' && p.data && p.mimeType) {
        const base64 = p.data.includes(',') ? p.data.split(',')[1] : p.data;
        return [{ type: 'image' as const, image: base64, mimeType: p.mimeType }];
      }
      return [];
    });
    return {
      role: msg.role,
      content: contentParts.length > 0 ? contentParts : [{ type: 'text' as const, text: '' }],
    };
  });
}

/**
 * 'text-only': strips all non-text parts.
 * Used by blog-chat and social-chat.
 */
function convertTextOnly(messages: UIMessage[]): ConvertedMessage[] {
  return messages.map((msg: any) => {
    const textParts = (msg.parts || [])
      .filter((p: any) => p.type === 'text')
      .map((p: any) => ({ type: 'text' as const, text: p.text }));
    return {
      role: msg.role,
      content: textParts.length > 0 ? textParts : [{ type: 'text' as const, text: '' }],
    };
  });
}

export async function convertMessages(
  messages: UIMessage[],
  mode: MessageConversionMode,
  entityLabel = 'document',
): Promise<ConvertedMessage[]> {
  if (mode === 'image-aware') return convertImageAware(messages, entityLabel);
  if (mode === 'file-aware') return convertFileAware(messages);
  return convertTextOnly(messages);
}
