'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ErrorBadge, PromptLabel } from './shared';
import type { NodeContentProps, DetailContentProps, EntityRenderer } from './types';

function BlogNodeContent({ version }: NodeContentProps) {
  const isError = !version.content && !!version.prompt;
  const snippet = version.content ? version.content.replace(/#+\s*/g, '').slice(0, 200) : '';

  return (
    <>
      <div className="relative overflow-hidden" style={{ height: 210 }}>
        {isError && <ErrorBadge />}
        {version.bannerImage ? (
          <img src={version.bannerImage} alt="" className="w-full h-20 object-cover" />
        ) : (
          <div className="w-full h-8 bg-gradient-to-r from-violet-100 to-blue-100 dark:from-violet-950 dark:to-blue-950" />
        )}
        <div className="p-3 overflow-hidden" style={{ maxHeight: version.bannerImage ? 90 : 145 }}>
          {version.tags && version.tags.length > 0 && (
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {version.tags.slice(0, 2).map(t => (
                <span key={t} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">#{t}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4">
            {snippet || (
              <span className={`italic ${isError ? 'text-red-500 dark:text-red-400 not-italic font-medium' : 'text-zinc-300 dark:text-zinc-600'}`}>
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

function BlogDetailContent({ version }: DetailContentProps) {
  return (
    <div className="p-5">
      {version.bannerImage && (
        <img src={version.bannerImage} alt="Banner" className="w-full rounded-lg mb-4 object-cover max-h-48" />
      )}
      {version.tags && version.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {version.tags.map(tag => (
            <span key={tag} className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full">#{tag}</span>
          ))}
        </div>
      )}
      <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{version.content || ''}</ReactMarkdown>
      </div>
    </div>
  );
}

export const blogRenderer: EntityRenderer = {
  NodeContent: BlogNodeContent,
  DetailContent: BlogDetailContent,
  hasError: (v) => !v.content && !!v.prompt,
};
