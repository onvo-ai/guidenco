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
import { ChevronDown, Download, Expand, FileText, Image as ImageIcon, Loader2, Paperclip, RotateCcw, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Dialog from '@radix-ui/react-dialog';
import { ExperimentDetailsCard, Experiment } from './experiment-details-card';

// Entity renderers
import { assetRenderer } from './entity-renderers/asset-renderer';
import { videoRenderer } from './entity-renderers/video-renderer';
import { blogRenderer } from './entity-renderers/blog-renderer';
import { documentRenderer } from './entity-renderers/document-renderer';
import { socialRenderer } from './entity-renderers/social-renderer';
import type { EntityRenderer } from './entity-renderers/types';

// Re-export types for consumers
export type { VersionNode, EntityType } from './entity-renderers/types';
import type { VersionNode, EntityType } from './entity-renderers/types';

// ─── Renderer registry ────────────────────────────────────────────────────────

const renderers: Record<EntityType, EntityRenderer> = {
  asset: assetRenderer,
  video: videoRenderer,
  blog_article: blogRenderer,
  document: documentRenderer,
  social_post: socialRenderer,
};

// ─── Layout ───────────────────────────────────────────────────────────────────

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
  experiment?: Experiment | null;
}

export const NODE_W = 280;
const NODE_H = 380;
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

// ─── Sidebar message helpers ──────────────────────────────────────────────────

function parseMsgParts(raw: any): any[] {
  if (!raw) return [];
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    if (Array.isArray((raw as any).parts)) return (raw as any).parts;
    if ((raw as any).content !== undefined) return parseMsgParts((raw as any).content);
    if (typeof (raw as any).text === 'string') return [{ type: 'text', text: (raw as any).text }];
  }
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

function normalisePart(part: any): any {
  if (!part || !part.type) return part;
  const t: string = part.type;
  if (t === 'text' || t === 'tool-call' || t === 'tool-result') return part;
  if (t === 'tool-invocation' && part.toolInvocation) {
    const ti = part.toolInvocation;
    return { type: 'tool-invocation', toolName: ti.toolName, args: ti.args, result: ti.result, state: ti.state };
  }
  if (t.startsWith('tool-')) {
    const toolName = t.slice(5);
    const args = part.args ?? part.output?.input ?? {};
    const result = part.output ?? part.result ?? null;
    return { type: 'tool-invocation', toolName, args, result };
  }
  return part;
}

function ToolInvocationCard({ toolName, args, result }: { toolName: string; args: any; result: any }) {
  const [showResult, setShowResult] = useState(false);
  const displayName = toolName.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
  const query = args?.query ?? args?.search ?? args?.term ?? args?.text ?? args?.keyword ?? args?.prompt ?? args?.title;
  const argKeys = Object.keys(args || {});
  const hasArgs = argKeys.length > 0;

  let resultLines: string[] = [];
  if (result != null) {
    const r = result?.result ?? result?.output ?? result;
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
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/60">
        <span className="shrink-0">🔧</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-300 capitalize">{displayName}</span>
        {query != null && (
          <span className="text-zinc-400 dark:text-zinc-500 italic truncate">"{String(query).slice(0, 60)}"</span>
        )}
        {result != null && (
          <button onClick={() => setShowResult(v => !v)} className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500 underline">
            {showResult ? 'hide result' : 'show result'}
          </button>
        )}
      </div>
      {hasArgs && query == null && (
        <div className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
          <pre className="text-[10px] leading-4 text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-all max-h-24 overflow-auto">
            {JSON.stringify(args, null, 2).slice(0, 400)}
          </pre>
        </div>
      )}
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

// ─── Version Sidebar ──────────────────────────────────────────────────────────

function VersionSidebar({
  open,
  version,
  entityType,
  onClose,
  docWidth,
  docHeight,
  experiment,
}: {
  open: boolean;
  version: VersionNode | null;
  entityType: EntityType;
  onClose: () => void;
  docWidth?: number;
  docHeight?: number;
  experiment?: Experiment | null;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selectedVersionIndex = useMemo(() => {
    if (!version || !experiment?.scores || experiment.scores.length === 0) return -1;
    const scoreMap = new Set(experiment.scores.map((s: any) => s.iteration));
    const sortedIterations = Array.from(scoreMap).sort((a: any, b: any) => a - b);
    const maybeVersionNum = sortedIterations.find((iter: any) => iter === Number(version.id));
    return maybeVersionNum ?? -1;
  }, [version, experiment]);

  const displayMetric = version?.metric
    ?? (selectedVersionIndex >= 0 ? String(experiment?.scores?.find((s: any) => s.iteration === selectedVersionIndex)?.score ?? '') : '')
    ?? '';

  const displayParameters =
    version?.parameters && version.parameters.length > 0
      ? version.parameters
      : (experiment?.parameters || []).map((p: any) => ({ id: p.key, value: String(p.value ?? '') }));

  useEffect(() => {
    if (!open || !version) return;
    let cancelled = false;
    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/messages?versionId=${version.id}&entityType=${entityType}`);
        if (res.ok && !cancelled) setMessages(await res.json());
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    };
    fetchMessages();
    return () => { cancelled = true; };
  }, [open, version?.id, entityType]);

  const renderer = renderers[entityType];
  const HeaderActions = renderer.HeaderActions;

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
              {/* Header */}
              <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{version.title || entityType}</p>
                  {version.prompt && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{version.prompt}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {HeaderActions && <HeaderActions version={version} />}
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                {/* Entity-specific preview */}
                <div className="border-b border-zinc-100 dark:border-zinc-800">
                  <renderer.DetailContent version={version} docWidth={docWidth} docHeight={docHeight} />
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
                    value={displayMetric}
                    placeholder="—"
                    className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-300 cursor-default focus:outline-none"
                  />
                </div>

                {/* Version Parameters */}
                <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Version Parameters</p>
                  {displayParameters.length > 0 ? (
                    <div className="space-y-2">
                      {displayParameters.map(p => (
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
                        const raw = msg.parts ?? msg.content ?? msg.text;
                        const isUser = msg.role === 'user';
                        const isTool = msg.role === 'tool';
                        const parts = parseMsgParts(raw).map(normalisePart);

                        if (isTool) {
                          const toolResults = parts.filter((p: any) => p.type === 'tool-result');
                          if (toolResults.length === 0) return null;
                          return (
                            <div key={msg.id} className="pl-8 space-y-1.5">
                              {toolResults.map((p: any, i: number) => <ToolResultBubble key={i} part={p} />)}
                            </div>
                          );
                        }

                        const textParts = parts.filter((p: any) => p.type === 'text' && p.text);
                        const toolCalls = parts.filter((p: any) =>
                          p.type === 'tool-call'
                          || p.type === 'tool-invocation'
                          || p.type === 'tool-result'
                          || (typeof p.type === 'string' && p.type.startsWith('tool-'))
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
                            {!isUser && hasToolCalls && (
                              <div className="flex gap-2.5 flex-row-reverse">
                                <div className="w-6 shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                  {toolCalls.map((p: any, i: number) => (
                                    p.type === 'tool-invocation'
                                      ? <ToolInvocationCard key={i} toolName={p.toolName} args={p.args} result={p.result} />
                                      : p.type === 'tool-result'
                                        ? <ToolResultBubble key={i} part={p} />
                                        : p.type === 'tool-call'
                                          ? <ToolCallBubble key={i} part={p} />
                                          : (typeof p.type === 'string' && p.type.startsWith('tool-'))
                                            ? <ToolInvocationCard key={i} toolName={p.type.slice(5)} args={p.args ?? p.output?.input ?? {}} result={p.output ?? p.result ?? null} />
                                            : null
                                  ))}
                                </div>
                              </div>
                            )}
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

// ─── Node shell ───────────────────────────────────────────────────────────────

function NodeShell({ selected, isRoot, children, onExpand, onDownload, onRetry, hasError }: {
  selected: boolean;
  isRoot?: boolean;
  children: React.ReactNode;
  onExpand: () => void;
  onDownload?: () => void;
  onRetry?: () => void;
  hasError?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden transition-all select-none ${selected
        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
        : hasError
          ? 'border-red-300 dark:border-red-700 hover:border-red-400 dark:hover:border-red-600'
          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
        }`}
      style={{ width: NODE_W }}
    >
      {isRoot && (
        <div className="absolute -left-9 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <div className="w-7 border-t-2 border-dashed border-zinc-300 dark:border-zinc-600" />
          <div className="border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[6px] border-l-zinc-300 dark:border-l-zinc-600" />
        </div>
      )}
      <Handle type="target" position={Position.Left} className="opacity-0 pointer-events-none" />
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

// ─── Node components ──────────────────────────────────────────────────────────

// Generating / error node state shown inside the shell for document
function DocGeneratingContent({ prompt }: { prompt?: string }) {
  return (
    <>
      <div className="flex flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-zinc-800" style={{ height: 210 }}>
        <Loader2 className="h-7 w-7 animate-spin text-zinc-400 dark:text-zinc-500" />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Generating...</p>
      </div>
      <div className="px-3 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {prompt || <span className="italic text-zinc-300 dark:text-zinc-600">No prompt</span>}
        </p>
      </div>
    </>
  );
}

function DocErrorContent({ prompt, onRetry }: { prompt?: string; onRetry?: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center justify-center gap-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/40" style={{ height: 210 }}>
        <p className="text-xs font-medium text-red-600 dark:text-red-400">Generation failed</p>
        {onRetry && (
          <button
            onClick={e => { e.stopPropagation(); onRetry(); }}
            className="h-7 px-2.5 rounded-full text-[11px] font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
          >
            Redo
          </button>
        )}
      </div>
      <div className="px-3 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {prompt || <span className="italic text-zinc-300 dark:text-zinc-600">No prompt</span>}
        </p>
      </div>
    </>
  );
}

// Single generic node that delegates to the renderer registry
function EntityVersionNode({ data, selected }: NodeProps) {
  const d = data as {
    version: VersionNode;
    entityType: EntityType;
    isRoot?: boolean;
    onExpand: () => void;
    onRetry?: () => void;
    docWidth?: number;
    docHeight?: number;
  };

  const [showRetry, setShowRetry] = useState(false);
  const isGenerating = d.version.status === 'generating';
  const isError = d.version.status === 'error';

  // For document: show retry button in NodeShell after 30s of generating
  useEffect(() => {
    if (d.entityType !== 'document' || !isGenerating) { setShowRetry(false); return; }
    const t = setTimeout(() => setShowRetry(true), 30000);
    return () => clearTimeout(t);
  }, [d.entityType, isGenerating]);

  const renderer = renderers[d.entityType];
  const hasError = renderer.hasError(d.version);
  const onDownload = renderer.getDownload?.(d.version);

  // Document has special generating/error states with inline retry
  if (d.entityType === 'document' && isGenerating) {
    return (
      <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand} onRetry={showRetry && d.onRetry ? d.onRetry : undefined}>
        <DocGeneratingContent prompt={d.version.prompt} />
      </NodeShell>
    );
  }
  if (d.entityType === 'document' && isError) {
    return (
      <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand} onRetry={d.onRetry} hasError>
        <DocErrorContent prompt={d.version.prompt} onRetry={d.onRetry} />
      </NodeShell>
    );
  }

  return (
    <NodeShell selected={!!selected} isRoot={d.isRoot} onExpand={d.onExpand} onDownload={onDownload} onRetry={d.onRetry} hasError={hasError}>
      <renderer.NodeContent version={d.version} docWidth={d.docWidth} docHeight={d.docHeight} />
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
  entityVersion: EntityVersionNode,
  pendingVersion: PendingVersionNode,
};

// ─── Model options ────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash', short: '3.0 Flash' },
  { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', short: '3.1 Flash Lite' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', short: '3.1 Pro' },
] as const;

type ModelId = typeof MODEL_OPTIONS[number]['id'];

// ─── Stream progress parser ───────────────────────────────────────────────────

function parseStreamLine(line: string): string | null {
  try {
    if (line.startsWith('0:')) {
      const text: string = JSON.parse(line.slice(2));
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (trimmed.length > 4) return trimmed.slice(0, 120);
      return null;
    }
    if (line.startsWith('9:')) {
      const data = JSON.parse(line.slice(2));
      if (data.toolName) return `Using: ${data.toolName.replace(/_/g, ' ')}`;
    }
    if (line.startsWith('a:')) return 'Processing result...';
  } catch { /* ignore */ }
  return null;
}

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
  experiment,
}: VersionFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [lightboxVersion, setLightboxVersion] = useState<VersionNode | null>(null);
  const [showExperimentCard, setShowExperimentCard] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelId>('google/gemini-3-flash-preview');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; dataUrl: string; mimeType: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();

  const draggedPositions = useRef<Record<string, { x: number; y: number }>>({});
  const pendingNodeRef = useRef<{
    id: string;
    prompt: string;
    parentId: string | null;
    position: { x: number; y: number };
  } | null>(null);
  const hasUserSelectedRef = useRef(false);
  const handleSubmitRef = useRef<(overridePrompt?: string, overrideParentId?: string | null) => void>(() => {});

  const effectiveGenerating = !!(isGenerating || generating);
  const setEffectiveGenerating = useCallback((v: boolean) => {
    setGenerating(v);
    onGeneratingChange?.(v);
  }, [onGeneratingChange]);

  const retryVersion = useCallback((v: VersionNode) => {
    if (!v.prompt || effectiveGenerating) return;
    const parentId = v.parentVersionId || null;

    // Immediately remove the failed node and its edge for instant visual feedback
    setNodes(prev => prev.filter(n => n.id !== v.id));
    setEdges(prev => prev.filter(e => e.source !== v.id && e.target !== v.id));

    // Start generation right away (this adds the pending node)
    handleSubmitRef.current(v.prompt, parentId);

    // Delete from DB and refresh in background
    if (entityType === 'video') {
      fetch(`/api/videos?versionId=${encodeURIComponent(v.id)}`, { method: 'DELETE' })
        .then(() => onUpdate())
        .catch(() => { });
    }
  }, [effectiveGenerating, entityType, onUpdate, setNodes, setEdges]);

  const versionMap = new Map(versions.map(v => [v.id, v]));

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

  useEffect(() => {
    if (versions.length === 0 && !pendingNodeRef.current) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const positions = versions.length > 0 ? layoutNodes(versions) : {};

    let resolvedSelectedId = selectedVersionId;
    if (!hasUserSelectedRef.current && resolvedSelectedId === null && versions.length > 0) {
      const { roots } = buildTree(versions);
      resolvedSelectedId = roots[0] || versions[0].id;
      setSelectedVersionId(resolvedSelectedId);
    }

    const { roots } = buildTree(versions);
    const rootSet = new Set(roots);
    const renderer = renderers[entityType];

    const newNodes: Node[] = versions.map(v => ({
      id: v.id,
      type: 'entityVersion',
      position: draggedPositions.current[v.id] ?? positions[v.id] ?? { x: 0, y: 0 },
      data: {
        version: v,
        entityType,
        isRoot: rootSet.has(v.id),
        onExpand: () => setLightboxVersion(v),
        ...(entityType === 'document' ? {
          docWidth: docWidth ?? 800,
          docHeight: docHeight ?? 600,
          onRetry: (v.status === 'generating' || v.status === 'error') ? () => retryVersion(v) : undefined,
        } : {}),
        ...(entityType !== 'document' && renderers[entityType].hasError(v) ? {
          onRetry: () => retryVersion(v),
        } : {}),
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

  useEffect(() => {
    if (versions.length > 0) setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
  }, [versions.length === 0 ? 0 : 1]);

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
    // Selection maintained by handleNodesChange interceptor
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

  const handleSubmit = useCallback(async (overridePrompt?: string, overrideParentId?: string | null) => {
    const userPrompt = (overridePrompt ?? prompt).trim();
    if (!userPrompt || effectiveGenerating) return;
    const filesToSend = overridePrompt ? [] : uploadedFiles;
    setPrompt('');
    setUploadedFiles([]);
    setEffectiveGenerating(true);

    let parentId = overrideParentId !== undefined ? overrideParentId : selectedVersionId;
    if (!parentId && versions.length > 0) {
      const { roots } = buildTree(versions);
      parentId = roots[0] || versions[0].id;
      setSelectedVersionId(parentId);
      hasUserSelectedRef.current = true;
    }

    const parentPromptChain = buildParentPromptChain(parentId);

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

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
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

  handleSubmitRef.current = handleSubmit;

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

      {/* Floating prompt bar */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 px-4 pointer-events-none">
        <div className="w-full max-w-2xl pointer-events-auto">
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

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
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
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1.5">
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

              <button
                onClick={() => handleSubmit()}
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

      {experiment && showExperimentCard && (
        <ExperimentDetailsCard
          experiment={experiment}
          onClose={() => setShowExperimentCard(false)}
        />
      )}

      <VersionSidebar
        open={!!lightboxVersion}
        version={lightboxVersion}
        entityType={entityType}
        onClose={() => setLightboxVersion(null)}
        docWidth={docWidth}
        docHeight={docHeight}
        experiment={experiment}
      />
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function VersionFlowCanvas(props: VersionFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas {...props} />
    </ReactFlowProvider>
  );
}
