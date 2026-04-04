'use client';

import { ErrorBadge, PromptLabel } from './shared';
import type { NodeContentProps, DetailContentProps, EntityRenderer } from './types';

const PLATFORM_COLORS: Record<string, string> = {
  twitter: 'from-sky-100 to-sky-50 dark:from-sky-950 dark:to-zinc-900',
  linkedin: 'from-blue-100 to-blue-50 dark:from-blue-950 dark:to-zinc-900',
  instagram: 'from-pink-100 to-orange-50 dark:from-pink-950 dark:to-zinc-900',
  facebook: 'from-blue-100 to-indigo-50 dark:from-blue-950 dark:to-zinc-900',
};
const PLATFORM_LABELS: Record<string, string> = { twitter: 'X', linkedin: 'in', instagram: '📷', facebook: 'f' };

function SocialNodeContent({ version }: NodeContentProps) {
  const isError = !version.content && !!version.prompt && !version.mediaUrl;
  const platform = version.platform || 'linkedin';
  const gradientClass = PLATFORM_COLORS[platform] || PLATFORM_COLORS.linkedin;
  const label = PLATFORM_LABELS[platform] || platform;
  const snippet = version.content ? version.content.slice(0, 160) : '';

  return (
    <>
      <div className={`relative bg-gradient-to-br ${gradientClass} overflow-hidden`} style={{ height: 210 }}>
        {isError && <ErrorBadge />}
        {version.mediaUrl ? (
          <img src={version.mediaUrl} alt="" className="w-full h-20 object-cover" />
        ) : null}
        <div className="p-3 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 bg-white/60 dark:bg-zinc-900/60 px-1.5 py-0.5 rounded">{label}</span>
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4">
            {snippet || (
              <span className={`italic ${isError ? 'text-red-500 dark:text-red-400 not-italic font-medium' : 'text-zinc-400'}`}>
                {isError ? 'Generation failed' : 'No content yet'}
              </span>
            )}
          </p>
        </div>
      </div>
      <PromptLabel prompt={version.prompt} />
    </>
  );
}

function SocialDetailContent({ version }: DetailContentProps) {
  return (
    <div className="p-5">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {version.mediaUrl && (
          <div className="aspect-video bg-zinc-100 dark:bg-zinc-800">
            <img src={version.mediaUrl} alt="Media" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-4">
          <p className="text-sm leading-6 whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{version.content}</p>
          {version.hashtags && version.hashtags.length > 0 && (
            <p className="mt-2 text-sm text-blue-500">{version.hashtags.map(h => `#${h}`).join(' ')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const socialRenderer: EntityRenderer = {
  NodeContent: SocialNodeContent,
  DetailContent: SocialDetailContent,
  hasError: (v) => !v.content && !!v.prompt && !v.mediaUrl,
};
