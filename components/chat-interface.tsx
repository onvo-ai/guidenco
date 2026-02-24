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

// ── Types ────────────────────────────────────────────────────────────────────

interface AssetRecord {
  id: string;
  title: string;
  description: string;
  fileKey: string;
  fileUrl: string;
  mimeType: string;
  source: string;
}

type MentionItem =
  | { type: 'page'; id: string; label: string; pageIndex: number; html: string }
  | { type: 'asset'; id: string; label: string; asset: AssetRecord };

// Split HTML on any page-break comment variant
const PAGE_BREAK_RE = /<!--\s*(?:PAGE_BREAK|GUIDENCO_PAGE_BREAK|ARTISTE_PAGE_BREAK)\s*-->/g;
function splitHtmlIntoPages(html: string): string[] {
  if (!html) return [];
  return html.split(PAGE_BREAK_RE);
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  projectId: string;
  selectedPageIndex: number;
  onArtworkUpdate: () => void;
  pendingElementPrompt?: { prompt: string; element: SelectedElement } | null;
  onElementPromptSent?: () => void;
  /** Current version's full HTML (with PAGE_BREAK markers). Used to populate page mentions. */
  artworkHtml?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatInterface({
  projectId,
  selectedPageIndex,
  onArtworkUpdate,
  pendingElementPrompt,
  onElementPromptSent,
  artworkHtml = '',
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
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAtIndex, setMentionAtIndex] = useState(-1);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // ── Derived: pages from artworkHtml ──
  const pages = useMemo(() => splitHtmlIntoPages(artworkHtml), [artworkHtml]);

  // ── Derived: all mention items (pages + assets) ──
  const allMentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];
    pages.forEach((html, idx) => {
      items.push({ type: 'page', id: `page-${idx}`, label: `Page ${idx + 1}`, pageIndex: idx, html });
    });
    availableAssets.forEach(asset => {
      items.push({ type: 'asset', id: asset.id, label: asset.title, asset });
    });
    return items;
  }, [pages, availableAssets]);

  const filteredMentionItems = useMemo<MentionItem[]>(() => {
    if (!mentionQuery) return allMentionItems;
    const q = mentionQuery.toLowerCase();
    return allMentionItems.filter(i => i.label.toLowerCase().includes(q));
  }, [allMentionItems, mentionQuery]);


  // ── Transport / chat ──
  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/chat?projectId=${projectId}&pageIndex=${selectedPageIndex}` }),
    [projectId, selectedPageIndex]
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({ transport });

  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = (status === 'submitted' || status === 'streaming') && !hasStalled;

  // ── Effects ──

  // Load chat history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch(`/api/messages?projectId=${projectId}`);
        if (response.ok) {
          const history = await response.json();
          setMessages(history);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    loadHistory();
  }, [projectId, setMessages]);

  // Fetch design warehouse assets
  useEffect(() => {
    fetch('/api/settings/assets')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAvailableAssets(data); })
      .catch(() => {}); // non-fatal
  }, []);

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

  // Extract artwork updates from messages
  useEffect(() => {
    if (messages.length === 0) return;
    let artworkWidth = 0;
    let artworkHeight = 0;
    let artworkHTML = '';
    let version = 0;
    let totalVersions = 0;
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.parts) continue;
      for (const part of message.parts) {
        const toolPart = part as any;
        const output = toolPart.output?.output || toolPart.output;
        if (toolPart.type === 'tool-createArtwork' && output) {
          artworkWidth = output.width;
          artworkHeight = output.height;
        } else if (toolPart.type === 'tool-writeHTML' && output) {
          artworkHTML = output.html;
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) artworkWidth = output.width;
          if (output.height) artworkHeight = output.height;
        } else if (toolPart.type === 'tool-editHTML' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) artworkWidth = output.width;
          if (output.height) artworkHeight = output.height;
        } else if (toolPart.type === 'tool-writePagesHTML' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) artworkWidth = output.width;
          if (output.height) artworkHeight = output.height;
        } else if (toolPart.type === 'tool-getArtworkState' && output) {
          if (output.width) artworkWidth = output.width;
          if (output.height) artworkHeight = output.height;
          if (output.html) artworkHTML = output.html;
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
    const currentState = `${artworkWidth}-${artworkHeight}-${artworkHTML}-${version}`;
    if (artworkWidth && artworkHeight && currentState !== lastProcessedState.current) {
      lastProcessedState.current = currentState;
      onArtworkUpdate();
    }
  }, [messages, onArtworkUpdate]);

  // ── Helpers ──

  const appendAssistantError = (text: string) => {
    setMessages((prev: any[]) => [
      ...prev,
      {
        id: `local-error-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        parts: [{ type: 'text', text }],
      },
    ]);
  };

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

      // Check asset match
      const asset = availableAssets.find(a => a.title === label);
      if (asset && asset.mimeType.startsWith('image/')) {
        try {
          const res = await fetch(`/api/assets/data?id=${encodeURIComponent(asset.id)}`);
          if (res.ok) {
            const { base64, mimeType } = await res.json();
            mentionImageParts.push({ type: 'image', image: base64, mimeType });
          }
        } catch {
          // Non-fatal – mention still stays in text
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
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
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
              <h2 className="text-2xl font-semibold mb-2">Create Digital Assets with AI</h2>
              <p>Ask me to create graphics, illustrations, or any visual content using canvas!</p>
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

                  if (toolName === 'createArtwork') {
                    const width = input?.width;
                    const height = input?.height;
                    const pageCount =
                      typeof input?.pageCount === 'number'
                        ? input.pageCount
                        : typeof output?.pageCount === 'number'
                          ? output.pageCount
                          : undefined;
                    if (width && height) {
                      displayMessage = `Artwork created with dimensions ${width}x${height}${typeof pageCount === 'number' ? ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})` : ''}`;
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
                  } else if (toolName === 'getArtworkState') {
                    const actualPageIndex =
                      typeof output?.pageIndex === 'number'
                        ? output.pageIndex
                        : typeof input?.pageIndex === 'number'
                          ? input.pageIndex
                          : typeof part.args?.pageIndex === 'number'
                            ? part.args.pageIndex
                            : selectedPageIndex;
                    displayMessage = `Inspecting current artwork (page ${actualPageIndex + 1})`;
                  } else if (toolName === 'createSVG') {
                    const svgTitle = input?.title || output?.title;
                    if (output?.success === false) {
                      displayMessage = `SVG creation failed: ${output?.error || 'unknown error'}`;
                    } else {
                      displayMessage = svgTitle ? `SVG created: "${svgTitle}"` : (output?.message || 'Generating SVG...');
                    }
                  }

                  const hasImage = (toolName === 'getArtworkState' || toolName === 'createSVG') && output?.image;
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
                            {toolName === 'createArtwork' && '🎨'}
                            {toolName === 'writeHTML' && '✏️'}
                            {toolName === 'editHTML' && '🔧'}
                            {toolName === 'writePagesHTML' && '✏️'}
                            {toolName === 'getArtworkState' && '👁️'}
                            {toolName === 'createPage' && '📄'}
                            {toolName === 'deletePage' && '🗑️'}
                            {toolName === 'searchImage' && '🔍'}
                            {toolName === 'listAssets' && '📦'}
                            {toolName === 'inspectAsset' && '🖼️'}
                            {toolName === 'createSVG' && '✨'}
                          </span>
                          <span className="font-medium">{displayMessage}</span>
                        </div>

                        {hasImage && (
                          <div className="mt-2">
                            <img
                              src={output.image}
                              alt={toolName === 'createSVG' ? (output.title || 'Generated SVG') : 'Artwork preview'}
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
                      </div>
                    </div>
                  );
                }

                // Text
                if (part.type === 'text' && part.text) {
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
                        <div className={`prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Images
                if (part.type === 'image') {
                  return (
                    <div key={partIdx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <img
                        src={`data:${part.mimeType || 'image/png'};base64,${part.image}`}
                        alt="Uploaded"
                        className="max-w-[200px] max-h-[200px] rounded border"
                      />
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
          {showMentionDropdown && (
            <div
              ref={mentionDropdownRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50"
            >
              <div className="max-h-60 overflow-y-auto">
                {filteredMentionItems.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-zinc-500 text-center">No pages or assets found</div>
                ) : (
                  <>
                    {/* Pages section */}
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
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                                flatIdx === mentionSelectedIndex
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

                    {/* Assets section */}
                    {assetItemsInDropdown.length > 0 && (
                      <>
                        <div className="sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-zinc-700/50">
                          Design Warehouse
                        </div>
                        {assetItemsInDropdown.map((item) => {
                          const flatIdx = filteredMentionItems.indexOf(item);
                          const asset = item.type === 'asset' ? item.asset : null;
                          return (
                            <button
                              key={item.id}
                              data-selected={flatIdx === mentionSelectedIndex ? 'true' : undefined}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                                flatIdx === mentionSelectedIndex
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

              {/* Footer hint */}
              <div className="border-t border-zinc-100 dark:border-zinc-700/50 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">↑↓ navigate · Enter to select · Esc to close</span>
                <span className="text-[11px] text-zinc-400">{filteredMentionItems.length} result{filteredMentionItems.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          {/* Image attachment previews */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachedImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={img.url} alt="Attached" className="h-20 w-20 object-cover rounded border" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
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

            {/* Image attach button */}
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

            {/* @ mention button */}
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
                  'whitespace-pre-wrap break-words',
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
                  // Keep mirror scrolled in sync when content overflows max-height
                  if (mirrorDivRef.current) {
                    mirrorDivRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                placeholder={input ? '' : 'Ask me to create something… or type @ to tag a page or asset'}
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
              type="submit"
              disabled={!input.trim() && attachedImages.length === 0}
              size="icon"
              className="h-11 w-11 shrink-0"
              title={isLoading ? 'Send (will cancel current request)' : 'Send message'}
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
