'use client';

import { useCallback, useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Expand, FileText, Image as ImageIcon, Loader2, Paperclip, RotateCcw, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Dialog from '@radix-ui/react-dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VersionNode {
  id: string;
  prompt?: string;
  parentVersionId?: string;
  timestamp: number;
  // Asset
  svgContent?: string;
  title?: string;
  width?: number;
  height?: number;
  // Video
  remotionCode?: string;
  videoUrl?: string;
  videoStatus?: string; // 'pending' | 'rendering' | 'done' | 'error'
  // Blog
  content?: string;
  bannerImage?: string | null;
  tags?: string[];
  // Social
  platform?: string;
  hashtags?: string[];
  mediaUrl?: string | null;
  // Document
  html?: string;
  googleFonts?: string[];
  // Experiment
  metric?: string;
  parameters?: { id: string; value: string }[];
  // Usage
  tokenCount?: number;
  creditCount?: number;
  model?: string;
  // Generation status
  status?: string; // 'generating' | 'done' | 'error'
}

export type EntityType = 'asset' | 'video' | 'blog_article' | 'social_post' | 'document';

interface VersionFlowCanvasProps {
  versions: VersionNode[];
  entityType: EntityType;
  entityId: string;
  apiEndpoint: string;
  onUpdate: () => void;
  isGenerating?: boolean;
  onGeneratingChange?: (v: boolean) => void;
  docWidth?: number;
  docHeight?: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const NODE_W = 280;
const NODE_H = 380;  // generous estimate for layout; actual rendered height may vary
const H_GAP = 100;
const V_GAP = 80;

function buildTree(versions: VersionNode[]) {
  const childrenMap: Record<string, string[]> = {};
  const roots: string[] = [];
  for (const v of versions) {
    if (v.parentVersionId) {
      if (!childrenMap[v.parentVersionId]) childrenMap[v.parentVersionId] = [];
      childrenMap[v.parentVersionId].push(v.id);
    } else {
      roots.push(v.id);
    }
  }
  return { childrenMap, roots };
}

// Horizontal left-to-right tree layout: children appear to the right of parent
function layoutNodes(versions: VersionNode[]): Record<string, { x: number; y: number }> {
  const { childrenMap, roots } = buildTree(versions);
  const positions: Record<string, { x: number; y: number }> = {};

  function measureSubtreeHeight(id: string): number {
    const children = childrenMap[id] || [];
    if (children.length === 0) return NODE_H;
    const childHeights = children.map(measureSubtreeHeight);
    return Math.max(NODE_H, childHeights.reduce((a, b) => a + b, 0) + V_GAP * (children.length - 1));
  }

  function place(id: string, x: number, y: number) {
    // (x, y) is the top-left corner of this node
    positions[id] = { x, y };
    const children = childrenMap[id] || [];
    if (children.length === 0) return;

    const childHeights = children.map(measureSubtreeHeight);
    const totalH = childHeights.reduce((a, b) => a + b, 0) + V_GAP * (children.length - 1);
    const parentCenterY = y + NODE_H / 2;

    let cy = parentCenterY - totalH / 2;
    for (let i = 0; i < children.length; i++) {
      const subtreeH = childHeights[i];
      const childY = cy + subtreeH / 2 - NODE_H / 2;
      place(children[i], x + NODE_W + H_GAP, childY);
      cy += subtreeH + V_GAP;
    }
  }

  const rootHeights = roots.map(measureSubtreeHeight);
  const totalRootH = rootHeights.reduce((a, b) => a + b, 0) + V_GAP * (roots.length - 1);
  let ry = -totalRootH / 2;
  for (let i = 0; i < roots.length; i++) {
    const subtreeH = rootHeights[i];
    const rootY = ry + subtreeH / 2 - NODE_H / 2;
    place(roots[i], 0, rootY);
    ry += subtreeH + V_GAP;
  }
  return positions;
}

// ─── Document helpers ────────────────────────────────────────────────────────

const DOC_PAGE_BREAK = '\n<!-- PAGE_BREAK -->\n';
const DOC_PAGE_BREAK_LEGACY_G = '\n<!-- GUIDENCO_PAGE_BREAK -->\n';
const DOC_PAGE_BREAK_LEGACY_A = '\n<!-- ARTISTE_PAGE_BREAK -->\n';

function splitDocPages(html: string): string[] {
  if (!html) return [''];
  const normalised = html
    .split(DOC_PAGE_BREAK_LEGACY_G).join(DOC_PAGE_BREAK)
    .split(DOC_PAGE_BREAK_LEGACY_A).join(DOC_PAGE_BREAK);
  const parts = normalised.split(DOC_PAGE_BREAK);
  return parts.length > 0 ? parts : [''];
}

function buildDocHtml(pageHtml: string, googleFonts: string[], width: number, height: number): string {
  const fontLinks = googleFonts
    .map(f => `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;500;600;700&display=swap" rel="stylesheet">`)
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"><\/script><link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">${fontLinks}<style>*,*::before,*::after{box-sizing:border-box;}body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;}</style></head><body>${pageHtml}</body></html>`;
}

// ─── Version Sidebar ──────────────────────────────────────────────────────────

function SidebarDocPreview({ pages, googleFonts, docWidth, docHeight }: { pages: string[]; googleFonts: string[]; docWidth: number; docHeight: number }) {
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

function parseMsgParts(raw: any): any[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [{ type: 'text', text: raw }];
    } catch {
      return [{ type: 'text', text: raw }];
    }
  }
  if (Array.isArray(raw)) return raw;
  return [{ type: 'text', text: String(raw) }];
}

// Normalise any part into one of: text | tool-call | tool-result | tool-invocation
function normalisePart(part: any): any {
  if (!part || !part.type) return part;
  const t: string = part.type;

  // Standard AI SDK v4 formats — pass through unchanged
  if (t === 'text' || t === 'tool-call' || t === 'tool-result') return part;

  // AI SDK "tool-invocation" wrapper
  if (t === 'tool-invocation' && part.toolInvocation) {
    const ti = part.toolInvocation;
    return { type: 'tool-invocation', toolName: ti.toolName, args: ti.args, result: ti.result, state: ti.state };
  }

  // Vercel AI SDK stored format: type = "tool-{Name}", output = { type:"tool-result", input:{...} }
  if (t.startsWith('tool-') && part.output) {
    const toolName = t.slice(5); // everything after "tool-"
    const args = part.output?.input ?? {};
    const result = part.output;
    return { type: 'tool-invocation', toolName, args, result };
  }

  return part;
}

function ToolInvocationCard({ toolName, args, result }: { toolName: string; args: any; result: any }) {
  const [showResult, setShowResult] = useState(false);
  const displayName = toolName.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();

  // Pick the most relevant arg to show inline
  const query = args?.query ?? args?.search ?? args?.term ?? args?.text ?? args?.keyword ?? args?.prompt ?? args?.title;
  const argKeys = Object.keys(args || {});
  const hasArgs = argKeys.length > 0;

  // Summarise result for preview
  let resultLines: string[] = [];
  if (result != null) {
    const r = result?.result ?? result;
    if (typeof r === 'string') {
      resultLines = [r.slice(0, 200)];
    } else if (Array.isArray(r)) {
      resultLines = r.slice(0, 5).map((item: any) => {
        if (item?.title) return item.title + (item.snippet ? ' — ' + String(item.snippet).slice(0, 80) : '');
        if (item?.text) return String(item.text).slice(0, 100);
        if (typeof item === 'string') return item.slice(0, 100);
        return JSON.stringify(item).slice(0, 100);
      });
    } else if (typeof r === 'object') {
      const keys = Object.keys(r).filter(k => k !== 'type');
      resultLines = keys.slice(0, 4).map(k => `${k}: ${String(r[k]).slice(0, 80)}`);
    }
  }

  return (
    <div className="text-[11px] border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      {/* Tool call header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/60">
        <span className="shrink-0">🔧</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-300 capitalize">{displayName}</span>
        {query != null && (
          <span className="text-zinc-400 dark:text-zinc-500 italic truncate">"{String(query).slice(0, 60)}"</span>
        )}
        {result != null && (
          <button
            onClick={() => setShowResult(v => !v)}
            className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500 underline"
          >
            {showResult ? 'hide result' : 'show result'}
          </button>
        )}
      </div>
      {/* Args (if no inline query shown) */}
      {hasArgs && query == null && (
        <div className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
          <pre className="text-[10px] leading-4 text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-all max-h-24 overflow-auto">
            {JSON.stringify(args, null, 2).slice(0, 400)}
          </pre>
        </div>
      )}
      {/* Result preview */}
      {showResult && resultLines.length > 0 && (
        <div className="px-2.5 py-2 space-y-1 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
          {resultLines.map((line, i) => (
            <p key={i} className="text-zinc-600 dark:text-zinc-400 leading-4 line-clamp-2">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallBubble({ part }: { part: any }) {
  return <ToolInvocationCard toolName={part.toolName || 'tool'} args={part.args || {}} result={null} />;
}

function ToolResultBubble({ part }: { part: any }) {
  return <ToolInvocationCard toolName={part.toolName || 'tool'} args={{}} result={part.result} />;
}

function MessageParts({ parts: raw }: { parts: any }) {
  const parts = parseMsgParts(raw);
  const hasContent = parts.some((p: any) => p.type === 'text' ? !!p.text : true);
  if (!hasContent) return null;
  return (
    <div className="space-y-1.5">
      {parts.map((part: any, i: number) => {
        if (part.type === 'text') {
          return part.text ? <div key={i} className="text-xs leading-5 prose prose-xs dark:prose-invert max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0"><ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown></div> : null;
        }
        if (part.type === 'tool-call') return <ToolCallBubble key={i} part={part} />;
        if (part.type === 'tool-result') return <ToolResultBubble key={i} part={part} />;
        return null;
      })}
    </div>
  );
}

function VersionSidebar({
  open,
  version,
  entityType,
  entityId,
  onClose,
  docWidth,
  docHeight,
}: {
  open: boolean;
  version: VersionNode | null;
  entityType: EntityType;
  entityId: string;
  onClose: () => void;
  docWidth?: number;
  docHeight?: number;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    if (!open || !version) return;
    let cancelled = false;
    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        let param = '';
        if (entityType === 'asset') param = `assetId=${entityId}`;
        else if (entityType === 'video') param = `videoId=${entityId}`;
        else if (entityType === 'blog_article') param = `articleId=${entityId}`;
        else if (entityType === 'social_post') param = `postId=${entityId}`;
        else param = `documentId=${entityId}`;
        const res = await fetch(`/api/messages?${param}`);
        if (res.ok && !cancelled) setMessages(await res.json());
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    };
    fetchMessages();
    return () => { cancelled = true; };
  }, [open, version?.id, entityId, entityType]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex flex-col w-[640px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500"
        >
          <Dialog.Title className="sr-only">{version?.title || entityType}</Dialog.Title>
          {version && (
            <>
              {/* Header — h-14 matches app header height */}
              <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{version.title || entityType}</p>
                  {version.prompt && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{version.prompt}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entityType === 'asset' && version.svgContent && (
                    <button
                      className="h-8 px-3 rounded-lg text-xs border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors text-zinc-700 dark:text-zinc-300"
                      onClick={() => downloadSvg(version.svgContent!, version.title)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      SVG
                    </button>
                  )}
                  {entityType === 'video' && version.videoUrl && (
                    <button
                      className="h-8 px-3 rounded-lg text-xs border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors text-zinc-700 dark:text-zinc-300"
                      onClick={() => downloadVideo(version.videoUrl!, version.title)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      MP4
                    </button>
                  )}
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                {/* Preview */}
                <div className="border-b border-zinc-100 dark:border-zinc-800">
                  {entityType === 'asset' && version.svgContent && (
                    <div className="flex items-center justify-center p-8 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-[size:16px_16px]">
                      <div
                        className="max-w-full"
                        dangerouslySetInnerHTML={{ __html: version.svgContent }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: 360 }}
                      />
                    </div>
                  )}
                  {entityType === 'video' && (
                    <div className="flex items-center justify-center bg-zinc-950 min-h-[220px]">
                      {version.videoUrl ? (
                        <video src={version.videoUrl} autoPlay loop muted playsInline controls className="max-w-full max-h-[340px]" />
                      ) : (
                        <div className="text-center text-zinc-400 p-8">
                          <div className="text-4xl mb-3">🎬</div>
                          <p className="text-sm">{version.title || 'Video composition'}</p>
                          <p className="text-xs mt-1 opacity-60">Not yet rendered</p>
                        </div>
                      )}
                    </div>
                  )}
                  {entityType === 'blog_article' && (
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
                      <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-6 max-h-64 overflow-hidden relative">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{version.content || ''}</ReactMarkdown>
                        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-zinc-900 to-transparent pointer-events-none" />
                      </div>
                    </div>
                  )}
                  {entityType === 'document' && (() => {
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
                  })()}
                  {entityType === 'social_post' && (
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
                  )}
                </div>

                {/* Usage stats */}
                {(version.tokenCount != null || version.creditCount != null || version.model) && (
                  <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Usage</p>
                    <div className="flex gap-3">
                      {version.model && (
                        <div className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Model</p>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{version.model}</p>
                        </div>
                      )}
                      {version.tokenCount != null && (
                        <div className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Tokens</p>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{version.tokenCount.toLocaleString()}</p>
                        </div>
                      )}
                      {version.creditCount != null && (
                        <div className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Credits</p>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{version.creditCount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metric */}
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Metric</p>
                  <input
                    readOnly
                    value={version.metric ?? ''}
                    placeholder="—"
                    className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-300 cursor-default focus:outline-none"
                  />
                </div>

                {/* Version Parameters */}
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Version Parameters</p>
                  {version.parameters && version.parameters.length > 0 ? (
                    <div className="space-y-2">
                      {version.parameters.map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 w-28 shrink-0 truncate font-mono">{p.id}</span>
                          <input
                            readOnly
                            value={p.value}
                            className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-700 dark:text-zinc-300 cursor-default focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-300 dark:text-zinc-600 italic">No parameters</p>
                  )}
                </div>

                {/* Chat Messages */}
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Chat Messages</p>
                  {loadingMessages ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-xs text-zinc-300 dark:text-zinc-600 italic">No messages</p>
                  ) : (
                    <div className="space-y-2 pb-4">
                      {messages.map((msg: any) => {
                        const raw = msg.parts ?? msg.content;
                        const isUser = msg.role === 'user';
                        const isTool = msg.role === 'tool';
                        const parts = parseMsgParts(raw).map(normalisePart);

                        // Tool-role messages: result cards indented under assistant
                        if (isTool) {
                          const toolResults = parts.filter((p: any) => p.type === 'tool-result');
                          if (toolResults.length === 0) return null;
                          return (
                            <div key={msg.id} className="pl-8 space-y-1.5">
                              {toolResults.map((p: any, i: number) => <ToolResultBubble key={i} part={p} />)}
                            </div>
                          );
                        }

                        // Separate text from tool parts so they render independently
                        const textParts = parts.filter((p: any) => p.type === 'text' && p.text);
                        const toolCalls = parts.filter((p: any) =>
                          p.type === 'tool-call' || p.type === 'tool-invocation'
                        );
                        const hasText = textParts.length > 0;
                        const hasToolCalls = toolCalls.length > 0;
                        if (!hasText && !hasToolCalls) return null;

                        const avatar = (
                          <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold mt-0.5 ${isUser ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'}`}>
                            {isUser ? 'U' : 'A'}
                          </div>
                        );

                        return (
                          <div key={msg.id} className="space-y-1.5">
                            {/* Tool calls/invocations: standalone cards on the assistant side */}
                            {!isUser && hasToolCalls && (
                              <div className="flex gap-2.5 flex-row-reverse">
                                <div className="w-6 shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                  {toolCalls.map((p: any, i: number) => (
                                    p.type === 'tool-invocation'
                                      ? <ToolInvocationCard key={i} toolName={p.toolName} args={p.args} result={p.result} />
                                      : <ToolCallBubble key={i} part={p} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Text bubble */}
                            {hasText && (
                              <div className={`flex gap-2.5 ${isUser ? '' : 'flex-row-reverse'}`}>
                                {avatar}
                                <div className={`flex-1 text-xs leading-5 rounded-xl px-3 py-2 prose prose-xs max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 ${isUser ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 prose-invert dark:prose-zinc'}`}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{textParts.map((p: any) => p.text).join('\n')}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadSvg(svgContent: string, title?: string) {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'asset'}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadVideo(videoUrl: string, title?: string) {
  const a = document.createElement('a');
  a.href = videoUrl;
  a.download = `${title || 'video'}.mp4`;
  a.click();
}

// ─── Node components ──────────────────────────────────────────────────────────

function NodeShell({ selected, isRoot, children, onExpand, onDownload, onRetry }: {
  selected: boolean;
  isRoot?: boolean;
  children: React.ReactNode;
  onExpand: () => void;
  onDownload?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border-2 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden transition-all select-none ${selected
        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
        }`}
      style={{ width: NODE_W }}
    >
      {/* Root node indicator: a short dashed line with arrowhead entering from the left */}
      {isRoot && (
        <div className="absolute -left-9 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <div className="w-7 border-t-2 border-dashed border-zinc-300 dark:border-zinc-600" />
          <div className="border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[6px] border-l-zinc-300 dark:border-l-zinc-600" />
        </div>
      )}
      <Handle type="target" position={Position.Left} className="opacity-0 pointer-events-none" />
      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        {onRetry && (
          <button
            className="p-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm"
            onClick={e => { e.stopPropagation(); onRetry(); }}
            title="Try again"
          >
            <RotateCcw className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
          </button>
        )}
        {onDownload && (
          <button
            className="p-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm"
            onClick={e => { e.stopPropagation(); onDownload(); }}
            title="Download"
          >
            <Download className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
          </button>
        )}
        <button
          className="p-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm"
          onClick={e => { e.stopPropagation(); onExpand(); }}
          title="Expand"
        >
          <Expand className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
        </button>
      </div>
      {children}
      <Handle type="source" position={Position.Right} className="opacity-0 pointer-events-none" />
    </div>
  );
}

function PromptLabel({ prompt }: { prompt?: string }) {
  return (
    <div className="px-3 py-3 border-t border-zinc-100 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {prompt ? prompt : <span className="italic text-zinc-300 dark:text-zinc-600">No prompt</span>}
      </p>
    </div>
  );
}

// Renders an SVG as an <img> via data URL to prevent ID conflicts across multiple inline SVGs
function SvgPreview({ svgContent, className }: { svgContent: string; className?: string }) {
  const dataUrl = useMemo(() => {
    try {
      // base64-encode so special characters and quotes don't break the data URL
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
    } catch {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
    }
  }, [svgContent]);

  return <img src={dataUrl} className={className} alt="SVG preview" />;
}

// Asset node
function AssetVersionNode({ data, selected }: NodeProps) {
  const d = data as { version: VersionNode; isRoot?: boolean; onExpand: () => void; onDownload: () => void };
  return (
    <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand} onDownload={d.onDownload}>
      <div className="relative bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden" style={{ height: 210 }}>
        {d.version.svgContent ? (
          <SvgPreview
            svgContent={d.version.svgContent}
            className="w-full h-full object-contain p-3"
          />
        ) : (
          <div className="text-zinc-300 dark:text-zinc-600 text-xs">No preview</div>
        )}
      </div>
      <PromptLabel prompt={d.version.prompt} />
    </NodeShell>
  );
}

// Video node
function VideoVersionNode({ data, selected }: NodeProps) {
  const d = data as { version: VersionNode; isRoot?: boolean; onExpand: () => void; onDownload?: () => void };
  const aspectRatio = (d.version.width && d.version.height)
    ? d.version.height / d.version.width
    : 9 / 16;
  const previewHeight = Math.round(NODE_W * aspectRatio);
  return (
    <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand} onDownload={d.onDownload}>
      <div className="relative bg-zinc-900 flex items-center justify-center" style={{ height: previewHeight }}>
        {d.version.videoUrl ? (
          <video
            src={d.version.videoUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
          />
        ) : d.version.videoStatus === 'rendering' ? (
          <div className="text-center text-zinc-300 px-3">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mx-auto mb-2" />
            <p className="text-xs opacity-60">{d.version.title || 'Video composition'}</p>
            <p className="text-[10px] mt-1 opacity-40">Rendering...</p>
          </div>
        ) : d.version.remotionCode ? (
          <div className="text-center text-zinc-300 px-3">
            <div className="text-3xl mb-2">🎬</div>
            <p className="text-xs opacity-60">{d.version.title || 'Video composition'}</p>
          </div>
        ) : (
          <div className="text-zinc-600 text-xs">No preview</div>
        )}
      </div>
      <PromptLabel prompt={d.version.prompt} />
    </NodeShell>
  );
}

// Blog node
function BlogVersionNode({ data, selected }: NodeProps) {
  const d = data as { version: VersionNode; isRoot?: boolean; onExpand: () => void };
  const snippet = d.version.content ? d.version.content.replace(/#+\s*/g, '').slice(0, 200) : '';
  return (
    <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand}>
      <div className="relative overflow-hidden" style={{ height: 210 }}>
        {d.version.bannerImage ? (
          <img src={d.version.bannerImage} alt="" className="w-full h-20 object-cover" />
        ) : (
          <div className="w-full h-8 bg-gradient-to-r from-violet-100 to-blue-100 dark:from-violet-950 dark:to-blue-950" />
        )}
        <div className="p-3 overflow-hidden" style={{ maxHeight: d.version.bannerImage ? 90 : 145 }}>
          {d.version.tags && d.version.tags.length > 0 && (
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {d.version.tags.slice(0, 2).map(t => (
                <span key={t} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">#{t}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4">
            {snippet || <span className="italic text-zinc-300 dark:text-zinc-600">No content yet</span>}
          </p>
        </div>
      </div>
      <PromptLabel prompt={d.version.prompt} />
    </NodeShell>
  );
}

// Document node
function DocumentVersionNode({ data, selected }: NodeProps) {
  const d = data as { version: VersionNode; isRoot?: boolean; onExpand: () => void; docWidth: number; docHeight: number; onRetry?: () => void };
  const [pageIndex, setPageIndex] = useState(0);
  const [showRetry, setShowRetry] = useState(false);

  const isGenerating = d.version.status === 'generating';

  // Show retry button after 30s of generating
  useEffect(() => {
    if (!isGenerating) { setShowRetry(false); return; }
    const t = setTimeout(() => setShowRetry(true), 30000);
    return () => clearTimeout(t);
  }, [isGenerating]);

  const pages = useMemo(() => splitDocPages(d.version.html || ''), [d.version.html]);
  const pageCount = pages.length;
  const currentPageHtml = pages[Math.min(pageIndex, pageCount - 1)] || '';

  const docW = d.docWidth || 800;
  const docH = d.docHeight || 600;
  const previewH = 210;
  const scale = NODE_W / docW;
  const scaledH = Math.round(docH * scale);
  const clampH = Math.min(scaledH, previewH);

  const iframeHtml = useMemo(
    () => buildDocHtml(currentPageHtml, d.version.googleFonts || [], docW, docH),
    [currentPageHtml, d.version.googleFonts, docW, docH]
  );

  if (isGenerating) {
    return (
      <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand} onRetry={showRetry && d.onRetry ? d.onRetry : undefined}>
        <div className="flex flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-800" style={{ height: previewH }}>
          <Loader2 className="h-7 w-7 animate-spin text-zinc-400 dark:text-zinc-500" />
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Generating...</p>
        </div>
        <PromptLabel prompt={d.version.prompt} />
      </NodeShell>
    );
  }

  return (
    <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand}>
      <div className="relative bg-zinc-50 dark:bg-zinc-800 overflow-hidden" style={{ height: previewH }}>
        {d.version.html ? (
          <>
            <div
              className="absolute top-0 left-0 overflow-hidden"
              style={{ width: NODE_W, height: clampH }}
            >
              <div
                style={{
                  width: docW,
                  height: docH,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                }}
              >
                <iframe
                  srcDoc={iframeHtml}
                  sandbox="allow-scripts"
                  style={{ width: docW, height: docH, border: 'none', display: 'block' }}
                />
              </div>
            </div>
            {pageCount > 1 && (
              <>
                {/* Left arrow */}
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow flex items-center justify-center disabled:opacity-20 hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                  onClick={e => { e.stopPropagation(); setPageIndex(i => Math.max(0, i - 1)); }}
                  disabled={pageIndex === 0}
                  title="Previous page"
                >
                  <ChevronLeft className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                </button>
                {/* Right arrow */}
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow flex items-center justify-center disabled:opacity-20 hover:bg-white dark:hover:bg-zinc-700 transition-colors"
                  onClick={e => { e.stopPropagation(); setPageIndex(i => Math.min(pageCount - 1, i + 1)); }}
                  disabled={pageIndex === pageCount - 1}
                  title="Next page"
                >
                  <ChevronRight className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                </button>
                {/* Dot indicators */}
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
      <PromptLabel prompt={d.version.prompt} />
    </NodeShell>
  );
}

// Social post node
const PLATFORM_COLORS: Record<string, string> = {
  twitter: 'from-sky-100 to-sky-50 dark:from-sky-950 dark:to-zinc-900',
  linkedin: 'from-blue-100 to-blue-50 dark:from-blue-950 dark:to-zinc-900',
  instagram: 'from-pink-100 to-orange-50 dark:from-pink-950 dark:to-zinc-900',
  facebook: 'from-blue-100 to-indigo-50 dark:from-blue-950 dark:to-zinc-900',
};
const PLATFORM_LABELS: Record<string, string> = { twitter: 'X', linkedin: 'in', instagram: '📷', facebook: 'f' };

function SocialVersionNode({ data, selected }: NodeProps) {
  const d = data as { version: VersionNode; isRoot?: boolean; onExpand: () => void };
  const platform = d.version.platform || 'linkedin';
  const gradientClass = PLATFORM_COLORS[platform] || PLATFORM_COLORS.linkedin;
  const label = PLATFORM_LABELS[platform] || platform;
  const snippet = d.version.content ? d.version.content.slice(0, 160) : '';
  return (
    <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand}>
      <div className={`relative bg-gradient-to-br ${gradientClass} overflow-hidden`} style={{ height: 210 }}>
        {d.version.mediaUrl ? (
          <img src={d.version.mediaUrl} alt="" className="w-full h-20 object-cover" />
        ) : null}
        <div className="p-3 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 bg-white/60 dark:bg-zinc-900/60 px-1.5 py-0.5 rounded">{label}</span>
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4">
            {snippet || <span className="italic text-zinc-400">No content yet</span>}
          </p>
        </div>
      </div>
      <PromptLabel prompt={d.version.prompt} />
    </NodeShell>
  );
}

// Pending node shown while generation is in progress
function PendingVersionNode({ data }: NodeProps) {
  const d = data as { prompt: string; progress?: string };
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30 shadow-lg overflow-hidden"
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} className="opacity-0 pointer-events-none" />
      <div className="flex flex-col items-center justify-center gap-3 p-4 min-h-[210px]">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500 shrink-0" />
        <p className="text-xs text-blue-600 dark:text-blue-400 text-center leading-relaxed">
          {d.progress || 'Generating...'}
        </p>
      </div>
      <div className="px-3 py-2 border-t border-blue-100 dark:border-blue-900">
        <p className="text-xs text-blue-500 dark:text-blue-400">{d.prompt}</p>
      </div>
      <Handle type="source" position={Position.Right} className="opacity-0 pointer-events-none" />
    </div>
  );
}

const nodeTypes = {
  assetVersion: AssetVersionNode,
  videoVersion: VideoVersionNode,
  blogVersion: BlogVersionNode,
  socialVersion: SocialVersionNode,
  documentVersion: DocumentVersionNode,
  pendingVersion: PendingVersionNode,
};

function nodeTypeForEntity(entityType: EntityType) {
  if (entityType === 'asset') return 'assetVersion';
  if (entityType === 'video') return 'videoVersion';
  if (entityType === 'blog_article') return 'blogVersion';
  if (entityType === 'document') return 'documentVersion';
  return 'socialVersion';
}

// ─── Model options ────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', short: '3.0 Flash' },
  { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', short: '3.1 Flash Lite' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', short: '3.1 Pro' },
] as const;

type ModelId = typeof MODEL_OPTIONS[number]['id'];

// ─── Inner canvas ─────────────────────────────────────────────────────────────

function InnerCanvas({
  versions,
  entityType,
  entityId,
  apiEndpoint,
  onUpdate,
  isGenerating,
  onGeneratingChange,
  docWidth,
  docHeight,
}: VersionFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [lightboxVersion, setLightboxVersion] = useState<VersionNode | null>(null);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelId>('google/gemini-3-flash-preview');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; dataUrl: string; mimeType: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();

  // Track user-dragged node positions so they survive version re-renders
  const draggedPositions = useRef<Record<string, { x: number; y: number }>>({});
  // Track the in-flight pending node so the layout effect can include it
  const pendingNodeRef = useRef<{
    id: string;
    prompt: string;
    parentId: string | null;
    position: { x: number; y: number };
  } | null>(null);
  // Once the user interacts with selection, stop auto-selecting
  const hasUserSelectedRef = useRef(false);

  const effectiveGenerating = !!(isGenerating || generating);
  const setEffectiveGenerating = useCallback((v: boolean) => {
    setGenerating(v);
    onGeneratingChange?.(v);
  }, [onGeneratingChange]);

  const retryVersion = useCallback(async (v: VersionNode) => {
    if (!v.prompt || effectiveGenerating) return;
    // Mark the stale generating version as error
    await fetch('/api/document-versions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: v.id, status: 'error' }),
    }).catch(() => { });
    await onUpdate();
    // Re-select the parent so the new generation branches correctly
    const parentId = v.parentVersionId || null;
    setSelectedVersionId(parentId);
    hasUserSelectedRef.current = true;
    setPrompt(v.prompt);
  }, [effectiveGenerating, onUpdate]);

  const versionMap = new Map(versions.map(v => [v.id, v]));

  // Build parent prompt chain from selected node up to root
  const buildParentPromptChain = useCallback((selectedId: string | null): string[] => {
    if (!selectedId) return [];
    const chain: string[] = [];
    let current = versionMap.get(selectedId);
    while (current) {
      if (current.prompt) chain.unshift(current.prompt);
      current = current.parentVersionId ? versionMap.get(current.parentVersionId) : undefined;
    }
    return chain;
  }, [versions]);

  // Rebuild the React Flow graph whenever versions, selection, or pending node changes
  useEffect(() => {
    if (versions.length === 0 && !pendingNodeRef.current) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const positions = versions.length > 0 ? layoutNodes(versions) : {};

    // Auto-select first node before user has interacted
    let resolvedSelectedId = selectedVersionId;
    if (!hasUserSelectedRef.current && resolvedSelectedId === null && versions.length > 0) {
      const { roots } = buildTree(versions);
      resolvedSelectedId = roots[0] || versions[0].id;
      setSelectedVersionId(resolvedSelectedId);
    }

    const { roots } = buildTree(versions);
    const rootSet = new Set(roots);

    const newNodes: Node[] = versions.map(v => ({
      id: v.id,
      type: nodeTypeForEntity(entityType),
      // Preserve dragged positions; fall back to computed layout
      position: draggedPositions.current[v.id] ?? positions[v.id] ?? { x: 0, y: 0 },
      data: {
        version: v,
        isRoot: rootSet.has(v.id),
        onExpand: () => setLightboxVersion(v),
        onDownload: v.svgContent
          ? () => downloadSvg(v.svgContent!, v.title)
          : v.videoUrl
            ? () => downloadVideo(v.videoUrl!, v.title)
            : undefined,
        ...(entityType === 'document' ? { docWidth: docWidth ?? 800, docHeight: docHeight ?? 600, onRetry: v.status === 'generating' ? () => retryVersion(v) : undefined } : {}),
      },
      selected: v.id === resolvedSelectedId,
    }));

    const newEdges: Edge[] = versions
      .filter(v => v.parentVersionId && versionMap.has(v.parentVersionId))
      .map(v => ({
        id: `e-${v.parentVersionId}-${v.id}`,
        source: v.parentVersionId!,
        target: v.id,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      }));

    // Inject pending node if one is in flight
    if (pendingNodeRef.current) {
      const p = pendingNodeRef.current;
      newNodes.push({
        id: p.id,
        type: 'pendingVersion',
        position: p.position,
        data: { prompt: p.prompt, progress: 'Generating...' },
        draggable: false,
        selectable: false,
      } as Node);
      if (p.parentId) {
        newEdges.push({
          id: `e-${p.parentId}-${p.id}`,
          source: p.parentId,
          target: p.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#93c5fd' },
          style: { stroke: '#93c5fd', strokeWidth: 2, strokeDasharray: '6 4' },
        });
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [versions, entityType, selectedVersionId]);

  // Fit view when the number of non-pending nodes first becomes non-zero
  useEffect(() => {
    if (versions.length > 0) setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
  }, [versions.length === 0 ? 0 : 1]);

  // Track dragged positions and guard against pane-click deselection.
  // Key insight: when the user clicks a *node*, onNodesChange contains both a
  // deselect (old node) AND a select (new node) in the same batch.
  // When the user clicks the *pane*, there are only deselects and no new selects.
  // So: if the batch has at least one new selection, let all changes through
  // (avoids dual-selection). If it has only deselects, block deselection of the
  // currently active node.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const hasNewSelection = changes.some(c => c.type === 'select' && (c as any).selected === true);
    const filtered = hasNewSelection
      ? changes
      : changes.map(change => {
        if (change.type === 'select' && !(change as any).selected && change.id === selectedVersionId) {
          return { ...change, selected: true };
        }
        return change;
      });
    onNodesChange(filtered);
    for (const change of filtered) {
      if (change.type === 'position' && (change as any).dragging && (change as any).position) {
        draggedPositions.current[change.id] = (change as any).position;
      }
    }
  }, [onNodesChange, selectedVersionId]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    if (node.type === 'pendingVersion') return;
    hasUserSelectedRef.current = true;
    setSelectedVersionId(node.id);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handlePaneClick = useCallback(() => {
    // Selection is maintained by the handleNodesChange interceptor above
  }, []);

  const selectedVersion = selectedVersionId ? versionMap.get(selectedVersionId) : undefined;

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedFiles(prev => [...prev, { name: file.name, dataUrl: reader.result as string, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || effectiveGenerating) return;
    const userPrompt = prompt.trim();
    const filesToSend = uploadedFiles;
    setPrompt('');
    setUploadedFiles([]);
    setEffectiveGenerating(true);

    // Enforce single root: if versions already exist, always branch from a node
    let parentId = selectedVersionId;
    if (!parentId && versions.length > 0) {
      const { roots } = buildTree(versions);
      parentId = roots[0] || versions[0].id;
      setSelectedVersionId(parentId);
      hasUserSelectedRef.current = true;
    }

    const parentPromptChain = buildParentPromptChain(parentId);

    // Calculate pending node position
    const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
    let pendingPosition: { x: number; y: number };
    if (parentNode) {
      const siblingX = parentNode.position.x + NODE_W + H_GAP;
      const siblingsAtX = nodes.filter(n => Math.abs(n.position.x - siblingX) < 20);
      if (siblingsAtX.length === 0) {
        pendingPosition = { x: siblingX, y: parentNode.position.y };
      } else {
        const maxSiblingY = Math.max(...siblingsAtX.map(n => n.position.y + NODE_H));
        pendingPosition = { x: siblingX, y: maxSiblingY + V_GAP };
      }
    } else {
      pendingPosition = { x: 0, y: 0 };
    }

    // Register pending node and inject it into the graph immediately
    const pendingId = `pending-${Date.now()}`;
    pendingNodeRef.current = { id: pendingId, prompt: userPrompt, parentId, position: pendingPosition };

    const pendingNode: Node = {
      id: pendingId,
      type: 'pendingVersion',
      position: pendingPosition,
      data: { prompt: userPrompt, progress: 'Generating...' },
      draggable: false,
      selectable: false,
    } as Node;

    setNodes(prev => [...prev, pendingNode]);
    if (parentId) {
      setEdges(prev => [...prev, {
        id: `e-${parentId}-${pendingId}`,
        source: parentId,
        target: pendingId,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#93c5fd' },
        style: { stroke: '#93c5fd', strokeWidth: 2, strokeDasharray: '6 4' },
      }]);
    }

    // Helper to update the progress text inside the pending node
    const updateProgress = (text: string) => {
      if (!pendingNodeRef.current || pendingNodeRef.current.id !== pendingId) return;
      setNodes(prev => prev.map(n =>
        n.id === pendingId ? { ...n, data: { ...n.data, progress: text } } : n
      ));
    };

    let endpoint = apiEndpoint;
    if (parentId) {
      const sep = endpoint.includes('?') ? '&' : '?';
      endpoint = `${endpoint}${sep}parentVersionId=${encodeURIComponent(parentId)}`;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: Date.now().toString(),
            role: 'user',
            parts: [
              ...filesToSend.map(f => ({ type: 'file', data: f.dataUrl, mimeType: f.mimeType, name: f.name })),
              { type: 'text', text: userPrompt },
            ],
            content: userPrompt,
          }],
          prompt: userPrompt,
          parentPromptChain,
          model: selectedModel,
        }),
      });

      if (!res.ok) { console.error('Generation failed:', await res.text()); return; }

      // Stream the response and surface progress in the pending node
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Parse AI SDK data stream lines for meaningful progress text
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const progress = parseStreamLine(line);
            if (progress) updateProgress(progress);
          }
        }
      }

      await onUpdate();
    } catch (err) {
      console.error('Error generating:', err);
    } finally {
      pendingNodeRef.current = null;
      setEffectiveGenerating(false);
    }
  }, [prompt, effectiveGenerating, selectedVersionId, versions, nodes, apiEndpoint, onUpdate, buildParentPromptChain, setEffectiveGenerating, selectedModel, uploadedFiles]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  const placeholder = selectedVersion
    ? 'Describe a variation to branch from this version...'
    : entityType === 'asset' ? 'Describe the SVG asset you want to create...'
      : entityType === 'video' ? 'Describe the video you want to create...'
        : entityType === 'blog_article' ? 'Describe the blog article you want to write...'
          : entityType === 'document' ? 'Describe the document you want to create...'
            : 'Describe the social post you want to write...';

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* React Flow canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.15}
          maxZoom={2}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable
          className="bg-zinc-50 dark:bg-zinc-950"
        >
          <Background color="#e4e4e7" gap={20} className="dark:opacity-20" />
          <Controls className="dark:bg-zinc-900 dark:border-zinc-700" />
        </ReactFlow>

        {versions.length === 0 && !effectiveGenerating && !nodes.some(n => n.type === 'pendingVersion') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="text-zinc-300 dark:text-zinc-600 text-5xl">✦</div>
            <p className="text-zinc-400 dark:text-zinc-500 text-sm font-medium">Write a prompt below to get started</p>
          </div>
        )}
      </div>

      {/* Centered floating prompt bar */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 px-4 pointer-events-none">
        <div className="w-full max-w-2xl pointer-events-auto">
          {/* Branch indicator */}
          {selectedVersion && (
            <div className="flex justify-center mb-2">
              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-full px-3 py-1 shadow-sm">
                <span>Branching from:</span>
                <span className="font-medium max-w-[200px] truncate">
                  {selectedVersion.prompt || `Version ${versions.indexOf(selectedVersion) + 1}`}
                </span>
                {versions.length === 0 && (
                  <button
                    onClick={() => { hasUserSelectedRef.current = true; setSelectedVersionId(null); }}
                    className="ml-1 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Input card */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
            {/* File pills */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                {uploadedFiles.map((f, i) => {
                  const isImage = f.mimeType.startsWith('image/');
                  return (
                    <div key={i} className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full pl-2 pr-1 py-1 text-xs text-zinc-700 dark:text-zinc-300 max-w-[180px]">
                      {isImage
                        ? <ImageIcon className="h-3 w-3 shrink-0 text-zinc-400" />
                        : <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                      }
                      <span className="truncate">{f.name}</span>
                      <button
                        onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                        className="shrink-0 ml-0.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 p-0.5 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={effectiveGenerating}
              rows={1}
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              style={{ minHeight: 48, maxHeight: 160, overflowY: 'auto', lineHeight: '1.5' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />
            {/* Bottom toolbar */}
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1.5">
                {/* File upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.svg"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={effectiveGenerating}
                  className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors text-zinc-500 dark:text-zinc-400"
                  title="Attach file"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>

                {/* Model selector */}
                <div className="relative">
                  <button
                    onClick={() => setModelMenuOpen(v => !v)}
                    disabled={effectiveGenerating}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors text-xs text-zinc-600 dark:text-zinc-400"
                  >
                    <span>{MODEL_OPTIONS.find(m => m.id === selectedModel)?.short ?? selectedModel}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                  {modelMenuOpen && (
                    <div className="absolute bottom-full mb-1.5 left-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 min-w-[180px]">
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => { setSelectedModel(opt.id); setModelMenuOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${selectedModel === opt.id ? 'text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-950/40' : 'text-zinc-700 dark:text-zinc-300'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Send button — circular */}
              <button
                onClick={handleSubmit}
                disabled={(!prompt.trim() && uploadedFiles.length === 0) || effectiveGenerating}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {effectiveGenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white dark:text-zinc-900" />
                  : <Send className="h-3.5 w-3.5 text-white dark:text-zinc-900" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Version Sidebar — always mounted so the close animation can play */}
      <VersionSidebar open={!!lightboxVersion} version={lightboxVersion} entityType={entityType} entityId={entityId} onClose={() => setLightboxVersion(null)} docWidth={docWidth} docHeight={docHeight} />
    </div>
  );
}

// ─── Stream progress parser ───────────────────────────────────────────────────

// Parses a single line from the Vercel AI SDK data stream and returns a
// human-readable progress string, or null if the line isn't interesting.
function parseStreamLine(line: string): string | null {
  try {
    // Text chunk: 0:"..."
    if (line.startsWith('0:')) {
      const text: string = JSON.parse(line.slice(2));
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (trimmed.length > 4) return trimmed.slice(0, 120);
      return null;
    }
    // Tool call start: 9:{...}
    if (line.startsWith('9:')) {
      const data = JSON.parse(line.slice(2));
      if (data.toolName) {
        return `Using: ${data.toolName.replace(/_/g, ' ')}`;
      }
    }
    // Tool result: a:{...}
    if (line.startsWith('a:')) {
      return 'Processing result...';
    }
  } catch { /* ignore parse errors */ }
  return null;
}

// ─── Public export ────────────────────────────────────────────────────────────

export function VersionFlowCanvas(props: VersionFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas {...props} />
    </ReactFlowProvider>
  );
}

