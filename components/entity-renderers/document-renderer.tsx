'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PromptLabel } from './shared';
import type { NodeContentProps, DetailContentProps, EntityRenderer } from './types';

const DOC_PAGE_BREAK = '\n<!-- PAGE_BREAK -->\n';
const DOC_PAGE_BREAK_LEGACY_G = '\n<!-- GUIDENCO_PAGE_BREAK -->\n';
const DOC_PAGE_BREAK_LEGACY_A = '\n<!-- ARTISTE_PAGE_BREAK -->\n';

export function splitDocPages(html: string): string[] {
  if (!html) return [''];
  const normalised = html
    .split(DOC_PAGE_BREAK_LEGACY_G).join(DOC_PAGE_BREAK)
    .split(DOC_PAGE_BREAK_LEGACY_A).join(DOC_PAGE_BREAK);
  const parts = normalised.split(DOC_PAGE_BREAK);
  return parts.length > 0 ? parts : [''];
}

export function buildDocHtml(pageHtml: string, googleFonts: string[], width: number, height: number): string {
  const fontLinks = googleFonts
    .map(f => `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;500;600;700&display=swap" rel="stylesheet">`)
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"><\/script><link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">${fontLinks}<style>*,*::before,*::after{box-sizing:border-box;}body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;}</style></head><body>${pageHtml}</body></html>`;
}

// NODE_W matches version-flow-canvas layout constant
const NODE_W = 280;

function DocumentNodeContent({ version, docWidth, docHeight }: NodeContentProps) {
  const [pageIndex, setPageIndex] = useState(0);

  const docW = docWidth || 800;
  const docH = docHeight || 600;
  const previewH = 210;
  const scale = NODE_W / docW;
  const scaledH = Math.round(docH * scale);
  const clampH = Math.min(scaledH, previewH);

  const pages = useMemo(() => splitDocPages(version.html || ''), [version.html]);
  const pageCount = pages.length;
  const currentPageHtml = pages[Math.min(pageIndex, pageCount - 1)] || '';
  const iframeHtml = useMemo(
    () => buildDocHtml(currentPageHtml, version.googleFonts || [], docW, docH),
    [currentPageHtml, version.googleFonts, docW, docH],
  );

  return (
    <>
      <div className="relative bg-zinc-50 dark:bg-zinc-800 overflow-hidden" style={{ height: previewH }}>
        {version.html ? (
          <>
            <div className="absolute top-0 left-0 overflow-hidden" style={{ width: NODE_W, height: clampH }}>
              <div
                style={{
                  width: docW,
                  height: docH,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                }}
              >
                <iframe srcDoc={iframeHtml} sandbox="allow-scripts" style={{ width: docW, height: docH, border: 'none', display: 'block' }} />
              </div>
            </div>
            {pageCount > 1 && (
              <>
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow flex items-center justify-center disabled:opacity-20 hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                  onClick={e => { e.stopPropagation(); setPageIndex(i => Math.max(0, i - 1)); }}
                  disabled={pageIndex === 0}
                >
                  <ChevronLeft className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                </button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow flex items-center justify-center disabled:opacity-20 hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                  onClick={e => { e.stopPropagation(); setPageIndex(i => Math.min(pageCount - 1, i + 1)); }}
                  disabled={pageIndex === pageCount - 1}
                >
                  <ChevronRight className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1 pointer-events-none">
                  {Array.from({ length: pageCount }).map((_, i) => (
                    <span
                      key={i}
                      className={`rounded-full transition-all ${i === pageIndex ? 'w-3 h-1.5 bg-zinc-600 dark:bg-zinc-300' : 'w-1.5 h-1.5 bg-zinc-400/60 dark:bg-zinc-500/60'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-300 dark:text-zinc-600">No preview</div>
        )}
      </div>
      <PromptLabel prompt={version.prompt} />
    </>
  );
}

export function SidebarDocPreview({ pages, googleFonts, docWidth, docHeight }: { pages: string[]; googleFonts: string[]; docWidth: number; docHeight: number }) {
  const [pageIndex, setPageIndex] = useState(0);
  const pageHtml = pages[pageIndex] || '';
  const previewWidth = 420;
  const previewHeight = Math.round(previewWidth * (docHeight / docWidth));
  const iframeHtml = useMemo(() => buildDocHtml(pageHtml, googleFonts, docWidth, docHeight), [pageHtml, googleFonts, docWidth, docHeight]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative bg-white shadow-lg overflow-hidden" style={{ width: previewWidth, height: previewHeight }}>
        <div style={{ width: docWidth, height: docHeight, transform: `scale(${previewWidth / docWidth})`, transformOrigin: 'top left' }}>
          <iframe srcDoc={iframeHtml} sandbox="allow-scripts" style={{ width: docWidth, height: docHeight, border: 'none', display: 'block' }} />
        </div>
      </div>
      {pages.length > 1 && (
        <div className="flex items-center gap-3">
          <button onClick={() => setPageIndex(i => Math.max(0, i - 1))} disabled={pageIndex === 0} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-zinc-500">{pageIndex + 1} / {pages.length}</span>
          <button onClick={() => setPageIndex(i => Math.min(pages.length - 1, i + 1))} disabled={pageIndex === pages.length - 1} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentDetailContent({ version, docWidth, docHeight }: DetailContentProps) {
  const pages = splitDocPages(version.html || '');
  return (
    <div className="flex flex-col items-center p-5 bg-zinc-50 dark:bg-zinc-800/30">
      <SidebarDocPreview
        pages={pages}
        googleFonts={version.googleFonts || []}
        docWidth={docWidth ?? 800}
        docHeight={docHeight ?? 600}
      />
    </div>
  );
}

export const documentRenderer: EntityRenderer = {
  NodeContent: DocumentNodeContent,
  DetailContent: DocumentDetailContent,
  hasError: (v) => v.status === 'error',
};
