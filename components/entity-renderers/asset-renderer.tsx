'use client';

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { ErrorBadge, PromptLabel } from './shared';
import type { VersionNode, NodeContentProps, DetailContentProps, EntityRenderer } from './types';

export function SvgPreview({ svgContent, className }: { svgContent: string; className?: string }) {
  const dataUrl = useMemo(() => {
    try {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
    } catch {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
    }
  }, [svgContent]);
  return <img src={dataUrl} className={className} alt="SVG preview" />;
}

export function downloadSvg(svgContent: string, title?: string) {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'asset'}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

function AssetNodeContent({ version }: NodeContentProps) {
  const isError = !version.svgContent && !!version.prompt;
  return (
    <>
      <div className="relative bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden" style={{ height: 210 }}>
        {isError && <ErrorBadge />}
        {version.svgContent ? (
          <SvgPreview svgContent={version.svgContent} className="w-full h-full object-contain p-3" />
        ) : (
          <div className={`text-xs ${isError ? 'text-red-500 dark:text-red-400 font-medium' : 'text-zinc-300 dark:text-zinc-600'}`}>
            {isError ? 'Generation failed' : 'No preview'}
          </div>
        )}
      </div>
      <PromptLabel prompt={version.prompt} />
    </>
  );
}

function AssetDetailContent({ version }: DetailContentProps) {
  if (!version.svgContent) return null;
  return (
    <div className="flex items-center justify-center p-8 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-[size:16px_16px]">
      <div
        className="max-w-full"
        dangerouslySetInnerHTML={{ __html: version.svgContent }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 360 }}
      />
    </div>
  );
}

function AssetHeaderActions({ version }: { version: VersionNode }) {
  if (!version.svgContent) return null;
  return (
    <button
      className="h-8 px-3 rounded-lg text-xs border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors text-zinc-700 dark:text-zinc-300"
      onClick={() => downloadSvg(version.svgContent!, version.title)}
    >
      <Download className="h-3.5 w-3.5" />
      SVG
    </button>
  );
}

export const assetRenderer: EntityRenderer = {
  NodeContent: AssetNodeContent,
  DetailContent: AssetDetailContent,
  HeaderActions: AssetHeaderActions,
  hasError: (v) => !v.svgContent && !!v.prompt,
  getDownload: (v) => v.svgContent ? () => downloadSvg(v.svgContent!, v.title) : undefined,
};
