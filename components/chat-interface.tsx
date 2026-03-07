'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useMemo, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Image as ImageIcon, X, AtSign, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SelectedElement } from '@/components/element-selector-overlay';

// ── Mention highlight overlay ────────────────────────────────────────────────
// Renders the textarea text with @[Label] tokens replaced by styled bubble chips.
// This sits behind the (transparent-text) textarea so users see the bubbles.
function MentionHighlightedText({ value }: { value: string }) {
  const segments = value.split(/(@\[[^\]]+\])/g);
  const nodes: React.ReactNode[] = [];

  segments.forEach((seg, i) => {
    const m = seg.match(/^@\[([^\]]+)\]$/);
    if (m) {
      nodes.push(
        <span key={i} className="mention-chip">
          @{m[1]}
        </span>
      );
    } else {
      // Split plain text on newlines → insert <br> between lines
      const lines = seg.split('\n');
      lines.forEach((line, j) => {
        nodes.push(<Fragment key={`${i}-${j}`}>{line}</Fragment>);
        if (j < lines.length - 1) nodes.push(<br key={`${i}-${j}-br`} />);
      });
    }
  });

  // Trailing zero-width space keeps the div at the correct height when the
  // last character is a newline or the input ends right after a chip.
  nodes.push('\u200b');
  return <>{nodes}</>;
}

function MentionBubbleText({ value, inverted = false }: { value: string; inverted?: boolean }) {
  const segments = value.split(/(@\[[^\]]+\])/g);

  return (
    <>
      {segments.map((seg, i) => {
        const m = seg.match(/^@\[([^\]]+)\]$/);
        if (m) {
          return (
            <span
              key={i}
              className={[
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mx-0.5 align-middle border',
                inverted
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
              ].join(' ')}
            >
              @{m[1]}
            </span>
          );
        }

        return <Fragment key={i}>{seg}</Fragment>;
      })}
    </>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface AssetRecord {
  id: string;
  title: string;
  description: string;
  fileKey: string;
  fileUrl: string;
  mimeType: string;
  source?: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  type: 'document' | 'asset' | 'video';
}

type MentionItem =
  | { type: 'page'; id: string; label: string; pageIndex: number; html: string }
  | { type: 'asset'; id: string; label: string; asset: AssetRecord }
  | { type: 'document-entity'; id: string; label: string; entity: ProjectRecord }
  | { type: 'asset-entity'; id: string; label: string; entity: ProjectRecord }
  | { type: 'video-entity'; id: string; label: string; entity: ProjectRecord };

// Split HTML on any page-break comment variant
const PAGE_BREAK_RE = /<!--\s*(?:PAGE_BREAK|GUIDENCO_PAGE_BREAK|ARTISTE_PAGE_BREAK)\s*-->/g;
function splitHtmlIntoPages(html: string): string[] {
  if (!html) return [];
  return html.split(PAGE_BREAK_RE);
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  entityId: string;
  entityType?: 'document' | 'asset' | 'video';
  selectedPageIndex?: number;
  onDocumentUpdate?: () => void;
  onUpdate?: () => void;
  apiEndpoint?: string;
  historyEndpoint?: string;
  placeholder?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  enableMentions?: boolean;
  enableImageUploads?: boolean;
  pendingElementPrompt?: { prompt: string; element: SelectedElement } | null;
  onElementPromptSent?: () => void;
  /** Current version's full HTML (with PAGE_BREAK markers). Used to populate page mentions. */
  documentHtml?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatInterface({
  entityId,
  entityType = 'document',
  selectedPageIndex = 0,
  onDocumentUpdate,
  onUpdate,
  apiEndpoint,
  historyEndpoint,
  placeholder = 'Describe what you want to create...',
  emptyStateTitle = 'Create Digital Assets with AI',
  emptyStateDescription = 'Ask me to create graphics, illustrations, or any visual content using canvas!',
  enableMentions = true,
  enableImageUploads = true,
  pendingElementPrompt,
  onElementPromptSent,
  documentHtml = '',
}: ChatInterfaceProps) {
  // ── Existing state ──
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<Array<{ url: string; file: File }>>([]);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasStalled, setHasStalled] = useState(false);
  const lastProcessedState = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorDivRef = useRef<HTMLDivElement>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Mention state ──
  const [availableAssets, setAvailableAssets] = useState<AssetRecord[]>([]);
  const [availableProjects, setAvailableProjects] = useState<ProjectRecord[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAtIndex, setMentionAtIndex] = useState(-1);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // ── Derived: pages from documentHtml ──
  const pages = useMemo(() => splitHtmlIntoPages(documentHtml), [documentHtml]);

  // ── Derived: all mention items (pages + documents + assets + videos) ──
  const allMentionItems = useMemo<MentionItem[]>(() => {
    if (!enableMentions) return [];
    const items: MentionItem[] = [];
    pages.forEach((html, idx) => {
      items.push({ type: 'page', id: `page-${idx}`, label: `Page ${idx + 1}`, pageIndex: idx, html });
    });
    availableProjects
      .filter((project) => project.id !== entityId && (project.type === 'document' || project.type === 'asset' || project.type === 'video'))
      .forEach((project) => {
        items.push({
          type: project.type === 'document' ? 'document-entity' : project.type === 'asset' ? 'asset-entity' : 'video-entity',
          id: project.id,
          label: project.name,
          entity: project,
        });
      });
    availableAssets.forEach(asset => {
      items.push({ type: 'asset', id: asset.id, label: asset.title, asset });
    });
    return items;
  }, [pages, availableAssets, availableProjects, entityId]);

  const filteredMentionItems = useMemo<MentionItem[]>(() => {
    if (!mentionQuery) return allMentionItems;
    const q = mentionQuery.toLowerCase();
    return allMentionItems.filter(i => i.label.toLowerCase().includes(q));
  }, [allMentionItems, mentionQuery]);


  // ── Transport / chat ──
  const transport = useMemo(
    () => new DefaultChatTransport({ api: apiEndpoint ?? `/api/chat?documentId=${entityId}&pageIndex=${selectedPageIndex}` }),
    [apiEndpoint, entityId, selectedPageIndex]
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({ transport });

  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = (status === 'submitted' || status === 'streaming') && !hasStalled;

  // ── Effects ──

  // Load chat history
  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const response = await fetch(historyEndpoint ?? `/api/messages?${entityType}Id=${entityId}`);
        if (response.ok) {
          const history = await response.json();
          if (!cancelled) {
            setMessages((currentMessages: any[]) => (currentMessages.length > 0 ? currentMessages : history));
          }
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };
    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [entityId, entityType, historyEndpoint, setMessages]);

  // Fetch design warehouse assets
  useEffect(() => {
    if (!enableMentions) return;
    fetch('/api/settings/assets')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAvailableAssets(data); })
      .catch(() => { }); // non-fatal
  }, [enableMentions]);

  useEffect(() => {
    if (!enableMentions) return;
    fetch('/api/entities')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAvailableProjects(data); })
      .catch(() => { });
  }, [enableMentions]);

  // Stall timer
  useEffect(() => {
    if (status !== 'submitted' && status !== 'streaming') {
      setHasStalled(false);
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      return;
    }
    if (stallTimerRef.current) return;
    stallTimerRef.current = setTimeout(() => {
      setHasStalled(true);
      appendAssistantError(
        'This is taking longer than expected and may have failed. Please try again. If it keeps happening, check the server logs for an error.'
      );
    }, 60_000);
    return () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
  }, [status]);

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Scroll selected mention item into view
  useEffect(() => {
    if (!showMentionDropdown || !mentionDropdownRef.current) return;
    const el = mentionDropdownRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [mentionSelectedIndex, showMentionDropdown]);

  // Auto-send element-targeted prompt
  useEffect(() => {
    if (!pendingElementPrompt || isLoading) return;
    const { prompt, element } = pendingElementPrompt;
    const fullText = `[ELEMENT EDIT REQUEST]
CSS Selector: ${element.selector}
Element label: ${element.label}
Current HTML of element:
\`\`\`html
${element.outerHTML}
\`\`\`

User instruction: ${prompt}

IMPORTANT: Only edit this specific element (matched by the CSS selector above). Do not change anything else on the page. Use editHTML with a targeted find/replace that modifies only this element's HTML.`;
    onElementPromptSent?.();
    (async () => {
      try {
        await sendMessage({ role: 'user', parts: [{ type: 'text', text: fullText }] });
      } catch (error) {
        console.error('Error sending element prompt:', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingElementPrompt]);

  // Extract document updates from messages
  useEffect(() => {
    if (!onUpdate && !onDocumentUpdate) return;
    if (onUpdate && status === 'ready' && messages.length > 0) {
      onUpdate();
    }
  }, [messages.length, onUpdate, onDocumentUpdate, status]);

  useEffect(() => {
    if (!onDocumentUpdate) return;
    if (messages.length === 0) return;
    let documentWidth = 0;
    let documentHeight = 0;
    let documentHTML = '';
    let version = 0;
    let totalVersions = 0;
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.parts) continue;
      for (const part of message.parts) {
        const toolPart = part as any;
        const output = toolPart.output?.output || toolPart.output;
        if (toolPart.type === 'tool-createDocument' && output) {
          documentWidth = output.width;
          documentHeight = output.height;
        } else if (toolPart.type === 'tool-writeHTML' && output) {
          documentHTML = output.html;
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) documentWidth = output.width;
          if (output.height) documentHeight = output.height;
        } else if (toolPart.type === 'tool-editHTML' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) documentWidth = output.width;
          if (output.height) documentHeight = output.height;
        } else if (toolPart.type === 'tool-writePagesHTML' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) documentWidth = output.width;
          if (output.height) documentHeight = output.height;
        } else if (toolPart.type === 'tool-getDocumentState' && output) {
          if (output.width) documentWidth = output.width;
          if (output.height) documentHeight = output.height;
          if (output.html) documentHTML = output.html;
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
        } else if (toolPart.type === 'tool-createPage' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
        } else if (toolPart.type === 'tool-deletePage' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
        }
      }
    }
    const currentState = `${documentWidth}-${documentHeight}-${documentHTML}-${version}`;
    if (documentWidth && documentHeight && currentState !== lastProcessedState.current) {
      lastProcessedState.current = currentState;
      onDocumentUpdate();
    }
  }, [messages, onDocumentUpdate]);

  // ── Helpers ──

  const appendAssistantError = (text: string) => {
    setMessages((prev) => ([
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text }] },
    ]));
  };

  const svgToPngDataUrl = async (svgContent: string, width: number, height: number) => {
    if (!svgContent) return null;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgElement = doc.documentElement;
      const widthAttr = Number(svgElement.getAttribute('width'));
      const heightAttr = Number(svgElement.getAttribute('height'));
      const viewBox = svgElement.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [];

      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to load SVG preview'));
        image.src = objectUrl;
      });

      const resolvedWidth = Number.isFinite(widthAttr) && widthAttr > 0
        ? widthAttr
        : (viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : (image.width || width || 1024));
      const resolvedHeight = Number.isFinite(heightAttr) && heightAttr > 0
        ? heightAttr
        : (viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : (image.height || height || 1024));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(resolvedWidth));
      canvas.height = Math.max(1, Math.round(resolvedHeight));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const htmlToPngDataUrl = async (html: string, width: number, height: number) => {
    if (!html || !width || !height) return null;

    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: html, width, height, format: 'base64', scale: 0.5 }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return typeof data?.image === 'string' ? data.image : null;
    } catch {
      return null;
    }
  };

  const normalizeImageSrc = (image: string, mimeType?: string) => {
    if (!image) return '';
    return image.startsWith('data:') ? image : `data:${mimeType || 'image/png'};base64,${image}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
  };

  const isHiddenContextPart = (text: string) => text.startsWith('[Context – ');

  // ── Mention handlers ──

  const selectMention = (item: MentionItem) => {
    const cursorPos = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionAtIndex);
    const after = input.slice(cursorPos);
    const inserted = `@[${item.label}]`;
    // Always add a trailing space; collapse any double-space created
    const newText = (before + inserted + ' ' + after).replace(/  +/g, ' ');
    setInput(newText);
    setShowMentionDropdown(false);
    setMentionQuery('');

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = mentionAtIndex + inserted.length + 1;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    });
  };

  const handleAtButtonClick = () => {
    if (!enableMentions) return;
    const pos = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, pos);
    const after = input.slice(pos);
    const newText = before + '@' + after;
    setInput(newText);
    setMentionAtIndex(pos);
    setMentionQuery('');
    setMentionSelectedIndex(0);
    setShowMentionDropdown(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos + 1, pos + 1);
    });
  };

  // ── Input / keyboard handlers ──

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!enableImageUploads) return;
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setAttachedImages((prev) => [...prev, { url, file }]);
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }

    // Detect @mention trigger: @ followed by non-space, non-bracket chars at end of text before cursor
    if (!enableMentions) {
      setShowMentionDropdown(false);
      setMentionQuery('');
      return;
    }

    const selStart = e.target.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, selStart);
    // Match the last @ that isn't part of a completed @[...] mention
    const atMatch = textBeforeCursor.match(/@([^@\s\[\]]*)$/);
    if (atMatch) {
      setShowMentionDropdown(true);
      setMentionQuery(atMatch[1]);
      setMentionAtIndex(selStart - atMatch[0].length);
      setMentionSelectedIndex(0);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown && filteredMentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex(i => Math.min(i + 1, filteredMentionItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentionItems[mentionSelectedIndex]) {
          selectMention(filteredMentionItems[mentionSelectedIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleTextareaBlur = () => {
    // Delay so dropdown item mousedown fires first
    setTimeout(() => setShowMentionDropdown(false), 150);
  };

  const renderInspectPreview = (toolName: string, output: any) => {
    const previewText =
      toolName === 'getVideo'
        ? output?.remotionCode
        : null;
    const previewLabel =
      toolName === 'getVideo'
        ? 'Video code sent to the LLM'
        : toolName === 'inspectAsset'
          ? 'Asset preview sent to the LLM'
          : toolName === 'getSVG'
            ? 'SVG preview sent to the LLM'
            : null;

    if ((toolName === 'inspectAsset' || toolName === 'getSVG') && output?.image) {
      return (
        <div className="mt-2 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{previewLabel}</div>
          <img
            src={output.image}
            alt={output?.title || 'Inspected asset'}
            className="max-w-[220px] max-h-[220px] rounded border border-zinc-200 dark:border-zinc-700 shadow-sm bg-white"
          />
        </div>
      );
    }

    if (!previewText || !previewLabel) return null;

    return (
      <div className="mt-2 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{previewLabel}</div>
        <pre className="max-h-48 overflow-auto rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap wrap-break-word">
          {previewText}
        </pre>
      </div>
    );
  };

  // ── Submit ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachedImages.length === 0) return;

    setShowMentionDropdown(false);

    if (isLoading) {
      stop();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setHasStalled(false);
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ── 1. Resolve @[mentions] ──
    const mentionImageParts: any[] = [];
    const mentionContextParts: any[] = [];
    const mentionTagRegex = /@\[([^\]]+)\]/g;
    const processedLabels = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = mentionTagRegex.exec(input)) !== null) {
      const label = m[1];
      if (processedLabels.has(label)) continue;
      processedLabels.add(label);

      const warehouseAsset = availableAssets.find(a => a.title === label);
      if (warehouseAsset && warehouseAsset.mimeType.startsWith('image/')) {
        try {
          const res = await fetch(`/api/assets/data?id=${encodeURIComponent(warehouseAsset.id)}`);
          if (res.ok) {
            const { base64, mimeType } = await res.json();
            mentionContextParts.push({
              type: 'text',
              text: `[Context – Warehouse asset ${warehouseAsset.title}]\nAsset URL: ${warehouseAsset.fileUrl}\nMime type: ${warehouseAsset.mimeType}${warehouseAsset.description ? `\nDescription: ${warehouseAsset.description}` : ''}`,
            });
            mentionImageParts.push({ type: 'image', image: base64, mimeType, fileUrl: warehouseAsset.fileUrl, title: warehouseAsset.title });
          }
        } catch {
          // Non-fatal – mention still stays in text
        }
        continue;
      }

      const mentionedEntity = availableProjects.find((project) => project.name === label);
      if (mentionedEntity?.type === 'document') {
        try {
          const res = await fetch(`/api/documents?documentId=${encodeURIComponent(mentionedEntity.id)}`);
          if (res.ok) {
            const document = await res.json();
            const html = document?.versions?.[document.currentVersion]?.html ?? '';
            if (html) {
              const pageCount = Array.isArray(document?.versions) ? splitHtmlIntoPages(html).length : 1;
              const documentUrl = `${window.location.origin}/app/documents/${mentionedEntity.id}`;
              const previewImage = await htmlToPngDataUrl(splitHtmlIntoPages(html)[0] || html, document.width ?? 1200, document.height ?? 800);
              mentionContextParts.push({
                type: 'text',
                text: `[Context – Document ${mentionedEntity.name}]\nDocument URL: ${documentUrl}\nTitle: ${document.title || mentionedEntity.name}\nWidth: ${document.width}\nHeight: ${document.height}\nPages: ${pageCount}\nHTML excerpt:\n\`\`\`html\n${html.slice(0, 3000)}\n\`\`\``,
              });
              if (previewImage) {
                mentionImageParts.push({ type: 'image', image: previewImage, mimeType: 'image/png', fileUrl: documentUrl, title: document.title || mentionedEntity.name });
              }
            }
          }
        } catch {
          // Non-fatal
        }
        continue;
      }

      if (mentionedEntity?.type === 'asset') {
        try {
          const res = await fetch(`/api/asset-generations?assetId=${encodeURIComponent(mentionedEntity.id)}`);
          if (res.ok) {
            const asset = await res.json();
            const currentSvgContent = asset?.svgContent || asset?.versions?.[asset.currentVersion]?.svgContent;
            const currentWidth = asset?.width ?? asset?.versions?.[asset.currentVersion]?.width ?? 1024;
            const currentHeight = asset?.height ?? asset?.versions?.[asset.currentVersion]?.height ?? 1024;

            if (currentSvgContent) {
              const svgUrl = `${window.location.origin}/api/asset-generations/file?assetId=${encodeURIComponent(mentionedEntity.id)}`;
              const pngPreview = await svgToPngDataUrl(currentSvgContent, currentWidth, currentHeight);

              mentionContextParts.push({
                type: 'text',
                text: `[Context – SVG asset ${mentionedEntity.name}]\nSVG URL: ${svgUrl}\nTitle: ${asset?.title || mentionedEntity.name}\nWidth: ${currentWidth}\nHeight: ${currentHeight}${pngPreview ? `\nPNG Preview: attached separately` : ''}`,
              });

              if (pngPreview) {
                mentionImageParts.push({
                  type: 'image',
                  image: pngPreview,
                  mimeType: 'image/png',
                  fileUrl: svgUrl,
                  title: asset?.title || mentionedEntity.name,
                });
              }
            }
          }
        } catch {
          // Non-fatal
        }
        continue;
      }

      if (mentionedEntity?.type === 'video') {
        try {
          const res = await fetch(`/api/videos?videoId=${encodeURIComponent(mentionedEntity.id)}`);
          if (res.ok) {
            const video = await res.json();
            const videoUrl = video?.videoUrl
              ? `${window.location.origin}/api/videos/file?key=${encodeURIComponent(video.videoUrl)}`
              : null;
            const code = video?.remotionCode || video?.versions?.[video?.currentVersion]?.remotionCode || '';

            mentionContextParts.push({
              type: 'text',
              text: `[Context – Video ${mentionedEntity.name}]\nVideo URL: ${videoUrl || 'Not rendered yet'}\nTitle: ${video?.title || mentionedEntity.name}\nWidth: ${video?.width ?? 1920}\nHeight: ${video?.height ?? 1080}\nDuration in frames: ${video?.durationInFrames ?? 150}\nFPS: ${video?.fps ?? 30}\nStatus: ${video?.status || 'unknown'}\nCode excerpt:\n\`\`\`tsx\n${code.slice(0, 3000)}\n\`\`\``,
            });
          }
        } catch {
          // Non-fatal
        }
        continue;
      }

      // Check page match
      const pageMatch = label.match(/^Page (\d+)$/i);
      if (pageMatch) {
        const idx = parseInt(pageMatch[1], 10) - 1;
        const pageHtml = pages[idx];
        if (pageHtml) {
          mentionContextParts.push({
            type: 'text',
            text: `[Context – HTML content of Page ${idx + 1}:]\n\`\`\`html\n${pageHtml.slice(0, 3000)}\n\`\`\``,
          });
        }
      }
    }

    // ── 2. Process manually attached images ──
    const attachedImageParts: any[] = [];
    for (const img of attachedImages) {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(img.file);
      });
      const mimeType = img.file.type || 'image/png';

      let fileUrl: string | null = null;
      try {
        const fd = new FormData();
        fd.append('file', img.file);
        fd.append('title', img.file.name.replace(/\.[^.]+$/, ''));
        fd.append('source', 'chat');
        const uploadRes = await fetch('/api/settings/assets', { method: 'POST', body: fd });
        if (uploadRes.ok) fileUrl = (await uploadRes.json()).fileUrl ?? null;
      } catch {
        // ignore
      }

      attachedImageParts.push({
        type: 'image',
        image: base64,
        mimeType,
        title: img.file.name,
        ...(fileUrl ? { fileUrl } : {}),
      });
    }

    // ── 3. Main text ──
    const mainTextParts: any[] = [];
    if (input.trim()) {
      mainTextParts.push({ type: 'text', text: input.trim() });
    }

    // Order: mention images → attached images → page context text → main text
    const parts = [
      ...mentionImageParts,
      ...attachedImageParts,
      ...mentionContextParts,
      ...mainTextParts,
    ];

    // Clear inputs
    setInput('');
    const imagesToCleanup = [...attachedImages];
    setAttachedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      abortControllerRef.current = new AbortController();
      await sendMessage({ role: 'user', parts });
    } catch (error) {
      console.error('Error sending message:', error);
      const message = error instanceof Error ? error.message : 'Request failed.';
      if (message !== 'Request aborted') {
        appendAssistantError(`Request failed: ${message}`);
        setHasStalled(true);
      }
    } finally {
      abortControllerRef.current = null;
    }

    imagesToCleanup.forEach(img => URL.revokeObjectURL(img.url));
  };

  // ── Drag & drop ──

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!enableImageUploads) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!enableImageUploads) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!enableImageUploads) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          setAttachedImages((prev) => [...prev, { url, file }]);
        }
      });
    }
  };

  // ── Mention dropdown sections for rendering ──
  const pageItemsInDropdown = filteredMentionItems.filter(i => i.type === 'page');
  const documentItemsInDropdown = filteredMentionItems.filter(i => i.type === 'document-entity');
  const assetProjectItemsInDropdown = filteredMentionItems.filter(i => i.type === 'asset-entity');
  const videoProjectItemsInDropdown = filteredMentionItems.filter(i => i.type === 'video-entity');
  const assetItemsInDropdown = filteredMentionItems.filter(i => i.type === 'asset');

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center backdrop-blur-[2px] pointer-events-none">
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-xl flex flex-col items-center gap-2">
            <ImageIcon className="h-8 w-8 text-blue-500 animate-bounce" />
            <p className="text-sm font-medium">Drop images to upload</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4 mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-zinc-500 py-12">
              <h2 className="text-2xl font-semibold mb-2">{emptyStateTitle}</h2>
              <p>{emptyStateDescription}</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              {message.parts?.map((part: any, partIdx: number) => {
                // Tool calls
                if (part.type?.startsWith('tool-')) {
                  const toolName = part.type?.replace('tool-', '');
                  const output = part.output?.output || part.output;
                  const input = part.output?.input || part.args;
                  let displayMessage = output?.message || toolName;

                  if (toolName === 'createDocument') {
                    const width = input?.width;
                    const height = input?.height;
                    const pageCount =
                      typeof input?.pageCount === 'number'
                        ? input.pageCount
                        : typeof output?.pageCount === 'number'
                          ? output.pageCount
                          : undefined;
                    if (width && height) {
                      displayMessage = `Document created with dimensions ${width}x${height}${typeof pageCount === 'number' ? ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})` : ''}`;
                    }
                  } else if (toolName === 'writeHTML') {
                    const pageIndex = output?.pageIndex;
                    const pageCount = output?.pageCount;
                    const version = output?.version;
                    if (typeof pageIndex === 'number' && typeof pageCount === 'number' && pageCount > 1) {
                      displayMessage = `HTML updated successfully for page ${pageIndex + 1} ${typeof version === 'number' ? ` (Version ${version + 1})` : ''}`;
                    } else {
                      displayMessage = output?.message || 'Writing HTML...';
                    }
                  } else if (toolName === 'editHTML') {
                    const pageIndex = output?.pageIndex;
                    const pageCount = output?.pageCount;
                    const version = output?.version;
                    if (typeof pageIndex === 'number' && typeof pageCount === 'number' && pageCount > 1) {
                      displayMessage = `HTML edited successfully for page ${pageIndex + 1} ${typeof version === 'number' ? ` (Version ${version + 1})` : ''}`;
                    } else {
                      displayMessage = output?.message || 'Editing HTML...';
                    }
                  } else if (toolName === 'writePagesHTML') {
                    const pageCount = output?.pageCount;
                    displayMessage = typeof pageCount === 'number' ? `Writing ${pageCount} pages...` : output?.message || 'Writing pages...';
                  } else if (toolName === 'createPage') {
                    const pageCount = output?.pageCount;
                    const pageIndex = output?.pageIndex;
                    if (typeof pageCount === 'number' && typeof pageIndex === 'number') {
                      displayMessage = `Page created (page ${pageIndex + 1} of ${pageCount})`;
                    } else {
                      displayMessage = output?.message || 'Creating page...';
                    }
                  } else if (toolName === 'deletePage') {
                    const pageCount = output?.pageCount;
                    const deletedPageIndex = output?.deletedPageIndex;
                    if (typeof pageCount === 'number' && typeof deletedPageIndex === 'number') {
                      displayMessage = `Page deleted (deleted page ${deletedPageIndex + 1}; now ${pageCount} pages)`;
                    } else {
                      displayMessage = output?.message || 'Deleting page...';
                    }
                  } else if (toolName === 'listAssets') {
                    const count = output?.assets?.length ?? 0;
                    displayMessage = count > 0 ? `Found ${count} asset${count !== 1 ? 's' : ''} in Design Warehouse` : 'No assets found in Design Warehouse';
                  } else if (toolName === 'inspectAsset') {
                    const title = output?.title;
                    displayMessage = title ? `Inspecting asset: ${title}` : 'Inspecting asset...';
                  } else if (toolName === 'searchImage') {
                    const searchQuery = input?.query || part.args?.query || output?.query;
                    displayMessage = searchQuery ? `Searching for images: "${searchQuery}"` : 'Searching for images...';
                  } else if (toolName === 'getDocumentState') {
                    const actualPageIndex =
                      typeof output?.pageIndex === 'number'
                        ? output.pageIndex
                        : typeof input?.pageIndex === 'number'
                          ? input.pageIndex
                          : typeof part.args?.pageIndex === 'number'
                            ? part.args.pageIndex
                            : selectedPageIndex;
                    displayMessage = `Inspecting current document (page ${actualPageIndex + 1})`;
                  } else if (toolName === 'saveSVG') {
                    const svgTitle = input?.title || output?.title;
                    if (output?.success === false) {
                      displayMessage = `SVG save failed: ${output?.error || 'unknown error'}`;
                    } else {
                      displayMessage = svgTitle ? `SVG updated: "${svgTitle}"` : (output?.message || 'Saving SVG...');
                    }
                  } else if (toolName === 'getSVG') {
                    const title = output?.title;
                    displayMessage = title ? `Inspecting asset: ${title}` : 'Inspecting current asset...';
                  } else if (toolName === 'saveVideo') {
                    const title = input?.title || output?.title;
                    if (output?.success === false) {
                      displayMessage = `Video generation failed: ${output?.error || 'unknown error'}`;
                    } else {
                      displayMessage = title ? `Video updated: "${title}"` : (output?.message || 'Generating video...');
                    }
                  } else if (toolName === 'getVideo') {
                    const title = output?.title;
                    displayMessage = title ? `Inspecting video: ${title}` : 'Inspecting current video...';
                  }

                  const hasImage = (toolName === 'getDocumentState' || toolName === 'getSVG') && output?.image;
                  const hasSearchImages =
                    toolName === 'searchImage' &&
                    output?.success &&
                    Array.isArray(output?.images) &&
                    output.images.length > 0;

                  return (
                    <div key={partIdx} className="w-full">
                      <div className="w-full rounded-md bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span>
                            {toolName === 'createDocument' && '🎨'}
                            {toolName === 'writeHTML' && '✏️'}
                            {toolName === 'editHTML' && '🔧'}
                            {toolName === 'writePagesHTML' && '✏️'}
                            {toolName === 'getDocumentState' && '👁️'}
                            {toolName === 'createPage' && '📄'}
                            {toolName === 'deletePage' && '🗑️'}
                            {toolName === 'searchImage' && '🔍'}
                            {toolName === 'listAssets' && '📦'}
                            {toolName === 'inspectAsset' && '🖼️'}
                            {toolName === 'saveSVG' && '✨'}
                            {toolName === 'getSVG' && '🖼️'}
                            {toolName === 'saveVideo' && '🎬'}
                            {toolName === 'getVideo' && '👁️'}
                            {!['createDocument', 'writeHTML', 'editHTML', 'writePagesHTML', 'getDocumentState', 'createPage', 'deletePage', 'searchImage', 'listAssets', 'inspectAsset', 'saveSVG', 'getSVG', 'saveVideo', 'getVideo'].includes(toolName) && '⚙️'}
                          </span>
                          <span className="font-medium">{displayMessage}</span>
                        </div>

                        {hasImage && (
                          <div className="mt-2">
                            <img
                              src={output.image}
                              alt={toolName === 'getSVG' ? (output.title || 'SVG preview') : 'Document preview'}
                              className="max-w-[200px] max-h-[200px] rounded border border-zinc-200 dark:border-zinc-700 shadow-sm bg-white"
                            />
                          </div>
                        )}

                        {hasSearchImages && (
                          <div className="mt-2 overflow-x-auto">
                            <div className="flex gap-2 pb-1">
                              {output.images.map((img: any, idx: number) => {
                                const thumbSrc = img?.thumbnail || img?.url;
                                const fullSrc = img?.url || img?.thumbnail;
                                if (!thumbSrc) return null;
                                const altText = img?.description || (typeof output?.query === 'string' ? output.query : 'Image option');
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => { if (typeof fullSrc === 'string') window.open(fullSrc, '_blank', 'noopener,noreferrer'); }}
                                    className="h-20 w-20 shrink-0 overflow-hidden rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                                    title={altText}
                                  >
                                    <img src={thumbSrc} alt={altText} className="h-full w-full object-cover" loading="lazy" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {renderInspectPreview(toolName, output)}
                      </div>
                    </div>
                  );
                }

                // Text
                if (part.type === 'text' && part.text) {
                  if (isHiddenContextPart(part.text)) {
                    return null;
                  }

                  if (part.text.startsWith('[ELEMENT EDIT REQUEST]')) {
                    const instructionMatch = part.text.match(/User instruction: ([\s\S]+?)(?:\n|$)/);
                    const selectorMatch = part.text.match(/CSS Selector: (.+?)(?:\n|$)/);
                    const instruction = instructionMatch?.[1]?.trim() ?? '';
                    const selector = selectorMatch?.[1]?.trim() ?? '';
                    return (
                      <div key={partIdx} className="flex justify-end">
                        <div className="max-w-[80%] rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-sm">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 truncate font-mono">{selector}</span>
                          </div>
                          <p className="text-zinc-800 dark:text-zinc-200 leading-snug">{instruction}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={partIdx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'}`}>
                        {message.role === 'user' ? (
                          <div className="text-sm leading-6 whitespace-pre-wrap wrap-break-word">
                            <MentionBubbleText value={part.text} inverted />
                          </div>
                        ) : (
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Images
                if (part.type === 'image') {
                  const src = normalizeImageSrc(part.image, part.mimeType);
                  const label = part.title || (part.fileUrl ? new URL(part.fileUrl, window.location.origin).pathname.split('/').pop() : null) || 'Attachment';
                  return (
                    <div key={partIdx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm max-w-[240px]">
                        <img
                          src={src}
                          alt="Attachment"
                          className="block max-w-[240px] max-h-[220px] w-full object-contain bg-zinc-50 dark:bg-zinc-950"
                        />
                        <div className="px-3 py-2 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 truncate">
                          {label}
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">AI is working...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Input area ── */}
      <div className="border-t p-4">
        <div className="mx-auto space-y-2 relative">

          {/* Mention dropdown – rendered above the input */}
          {enableMentions && showMentionDropdown && (
            <div
              ref={mentionDropdownRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50"
            >
              <div className="max-h-60 overflow-y-auto">
                {filteredMentionItems.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-zinc-500 text-center">No pages, documents, assets, or videos found</div>
                ) : (
                  <>
                    {pageItemsInDropdown.length > 0 && (
                      <>
                        <div className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-zinc-700/50">
                          Pages
                        </div>
                        {pageItemsInDropdown.map((item) => {
                          const flatIdx = filteredMentionItems.indexOf(item);
                          return (
                            <button
                              key={item.id}
                              data-selected={flatIdx === mentionSelectedIndex ? 'true' : undefined}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${flatIdx === mentionSelectedIndex
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                              onMouseDown={(e) => { e.preventDefault(); selectMention(item); }}
                              onMouseEnter={() => setMentionSelectedIndex(flatIdx)}
                            >
                              <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                              <span className="flex-1 truncate font-medium">{item.label}</span>
                              <span className="text-xs text-zinc-400 shrink-0">Page</span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {videoProjectItemsInDropdown.length > 0 && (
                      <>
                        <div className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-zinc-700/50">
                          Videos
                        </div>
                        {videoProjectItemsInDropdown.map((item) => {
                          const flatIdx = filteredMentionItems.indexOf(item);
                          return (
                            <button
                              key={item.id}
                              data-selected={flatIdx === mentionSelectedIndex ? 'true' : undefined}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${flatIdx === mentionSelectedIndex
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                              onMouseDown={(e) => { e.preventDefault(); selectMention(item); }}
                              onMouseEnter={() => setMentionSelectedIndex(flatIdx)}
                            >
                              <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                              <span className="flex-1 truncate font-medium">{item.label}</span>
                              <span className="text-xs text-zinc-400 shrink-0">Video</span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {documentItemsInDropdown.length > 0 && (
                      <>
                        <div className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-zinc-700/50">
                          Documents
                        </div>
                        {documentItemsInDropdown.map((item) => {
                          const flatIdx = filteredMentionItems.indexOf(item);
                          return (
                            <button
                              key={item.id}
                              data-selected={flatIdx === mentionSelectedIndex ? 'true' : undefined}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${flatIdx === mentionSelectedIndex
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                              onMouseDown={(e) => { e.preventDefault(); selectMention(item); }}
                              onMouseEnter={() => setMentionSelectedIndex(flatIdx)}
                            >
                              <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                              <span className="flex-1 truncate font-medium">{item.label}</span>
                              <span className="text-xs text-zinc-400 shrink-0">Document</span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {assetProjectItemsInDropdown.length > 0 && (
                      <>
                        <div className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-zinc-700/50">
                          Assets
                        </div>
                        {assetProjectItemsInDropdown.map((item) => {
                          const flatIdx = filteredMentionItems.indexOf(item);
                          return (
                            <button
                              key={item.id}
                              data-selected={flatIdx === mentionSelectedIndex ? 'true' : undefined}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${flatIdx === mentionSelectedIndex
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                              onMouseDown={(e) => { e.preventDefault(); selectMention(item); }}
                              onMouseEnter={() => setMentionSelectedIndex(flatIdx)}
                            >
                              <ImageIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                              <span className="flex-1 truncate font-medium">{item.label}</span>
                              <span className="text-xs text-zinc-400 shrink-0">Asset</span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {assetItemsInDropdown.length > 0 && (
                      <>
                        <div className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-zinc-700/50">
                          Warehouse Assets
                        </div>
                        {assetItemsInDropdown.map((item) => {
                          const flatIdx = filteredMentionItems.indexOf(item);
                          const asset = item.type === 'asset' ? item.asset : null;
                          return (
                            <button
                              key={item.id}
                              data-selected={flatIdx === mentionSelectedIndex ? 'true' : undefined}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${flatIdx === mentionSelectedIndex
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                              onMouseDown={(e) => { e.preventDefault(); selectMention(item); }}
                              onMouseEnter={() => setMentionSelectedIndex(flatIdx)}
                            >
                              {asset?.mimeType.startsWith('image/') ? (
                                <img
                                  src={`/api/assets/image?id=${asset.id}`}
                                  alt={item.label}
                                  className="h-6 w-6 rounded object-cover shrink-0 border border-zinc-200 dark:border-zinc-700"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <ImageIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                              )}
                              <span className="flex-1 truncate font-medium">{item.label}</span>
                              <span className="text-xs text-zinc-400 shrink-0">Asset</span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-700/50 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">↑↓ navigate · Enter to select · Esc to close</span>
                <span className="text-[11px] text-zinc-400">{filteredMentionItems.length} result{filteredMentionItems.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-zinc-950 space-y-3">
            {enableImageUploads && attachedImages.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Attachments</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{attachedImages.length} image{attachedImages.length !== 1 ? 's' : ''} ready to send</div>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                  {attachedImages.map((img, idx) => (
                    <div key={idx} className="relative group w-[120px] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-sm">
                      <img src={img.url} alt="Attached" className="h-24 w-full object-cover" />
                      <div className="p-2">
                        <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">{img.file.name}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatBytes(img.file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />

              {enableImageUploads && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="h-11 w-11 shrink-0"
                  title="Attach image"
                >
                  <ImageIcon className="h-5 w-5" />
                </Button>
              )}

              {enableMentions && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAtButtonClick}
                  disabled={isLoading}
                  className="h-11 w-11 shrink-0"
                  title="Mention a page or asset (@)"
                >
                  <AtSign className="h-5 w-5" />
                </Button>
              )}

              {/*
                ── Mention-highlight textarea ────────────────────────────────
                The wrapper is `relative` so the mirror div can be stacked
                directly behind the textarea. The textarea itself has transparent
                text (only the caret shows) while the mirror div renders the same
                content with @[…] tokens replaced by styled bubble chips.
              */}
              <div className="relative flex-1 min-h-[44px]">
                {/* Mirror layer – aria-hidden, pointer-events off */}
                <div
                  ref={mirrorDivRef}
                  aria-hidden="true"
                  className={[
                    // Match textarea geometry exactly
                    'absolute inset-0 px-3 py-3 text-sm',
                    // Prevent interaction; clip overflow without showing scrollbar
                    'pointer-events-none overflow-hidden',
                    // Text wrapping to match textarea behaviour
                    'whitespace-pre-wrap wrap-break-word',
                    // Inherit leading so chips align with text baseline
                    'leading-normal',
                  ].join(' ')}
                >
                  <MentionHighlightedText value={input} />
                </div>

                {/* Actual textarea – text made transparent so mirror shows */}
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleTextareaBlur}
                  onScroll={(e) => {
                    if (mirrorDivRef.current) {
                      mirrorDivRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  placeholder={input ? '' : placeholder}
                  disabled={isLoading}
                  className="relative w-full min-h-[44px] h-[44px] max-h-[200px] resize-none overflow-y-auto py-3 bg-transparent dark:bg-transparent"
                  style={
                    input.length > 0
                      ? { color: 'transparent', caretColor: 'hsl(var(--foreground))' }
                      : undefined
                  }
                  rows={1}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>

              <Button
                type={isLoading ? 'button' : 'submit'}
                onClick={isLoading ? () => stop() : undefined}
                disabled={!isLoading && !input.trim() && attachedImages.length === 0}
                size="icon"
                className="h-11 w-11 shrink-0"
                title={isLoading ? 'Stop generation' : 'Send message'}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
