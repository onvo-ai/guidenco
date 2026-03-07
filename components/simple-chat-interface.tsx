'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ChatMessagePart = {
  type?: string;
  text?: string;
  args?: Record<string, any>;
  output?: any;
  toolName?: string;
  image?: string;
  mimeType?: string;
};

interface SimpleChatInterfaceProps {
  entityId: string;
  entityType?: 'document' | 'asset' | 'video';
  apiEndpoint: string;
  onUpdate: () => void;
  placeholder?: string;
  historyEndpoint?: string;
}

export function SimpleChatInterface({
  entityId,
  entityType = 'document',
  apiEndpoint,
  onUpdate,
  placeholder = 'Describe what you want to create...',
  historyEndpoint,
}: SimpleChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `${apiEndpoint}?${entityType}Id=${entityId}` }),
    [apiEndpoint, entityId, entityType]
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({ transport });

  const isLoading = status === 'submitted' || status === 'streaming';
  const visibleMessages = useMemo(
    () => messages.filter((msg) => {
      const textContent = (msg.parts || [])
        .map((part: ChatMessagePart) => part.text ?? '')
        .join('')
        .trim();
      const hasToolParts = (msg.parts || []).some((part: ChatMessagePart) => part.type?.startsWith('tool-'));

      return msg.role === 'user' || textContent.length > 0 || hasToolParts;
    }),
    [messages]
  );

  // Load message history
  useEffect(() => {
    const endpoint = historyEndpoint ?? `/api/messages?${entityType}Id=${entityId}`;
    const load = async () => {
      try {
        const res = await fetch(endpoint);
        if (res.ok) setMessages(await res.json());
      } catch (e) {
        console.error('Error loading history:', e);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    load();
  }, [entityId, entityType, historyEndpoint]);

  // Trigger onUpdate when the stream finishes
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== 'ready' && status === 'ready' && messages.length > 0) {
      onUpdate();
    }
    prevStatus.current = status;
  }, [status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderToolPart = (part: ChatMessagePart, partIdx: number) => {
    const toolName = part.type?.replace('tool-', '') || part.toolName || 'tool';
    const output = part.output?.output || part.output;
    const input = part.output?.input || part.args;
    let displayMessage = output?.message || toolName;

    if (toolName === 'searchImage') {
      const searchQuery = input?.query || output?.query;
      displayMessage = searchQuery ? `Searching for images: "${searchQuery}"` : 'Searching for images...';
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
    } else if (toolName === 'saveSVG') {
      const title = input?.title || output?.title;
      if (output?.success === false) {
        displayMessage = `SVG save failed: ${output?.error || 'unknown error'}`;
      } else {
        displayMessage = title ? `SVG updated: "${title}"` : (output?.message || 'Saving SVG...');
      }
    } else if (toolName === 'getSVG') {
      const title = output?.title;
      displayMessage = title ? `Inspecting asset: ${title}` : 'Inspecting current asset...';
    }

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
              {toolName === 'searchImage' && '🔍'}
              {toolName === 'saveVideo' && '🎬'}
              {toolName === 'getVideo' && '👁️'}
              {toolName === 'saveSVG' && '✨'}
              {toolName === 'getSVG' && '🖼️'}
              {!['searchImage', 'saveVideo', 'getVideo', 'saveSVG', 'getSVG'].includes(toolName) && '⚙️'}
            </span>
            <span className="font-medium">{displayMessage}</span>
          </div>

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
  };

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {visibleMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Start a conversation to generate content
          </div>
        )}
        {visibleMessages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            {msg.parts?.map((part: ChatMessagePart, partIdx: number) => {
              if (part.type?.startsWith('tool-')) {
                return renderToolPart(part, partIdx);
              }

              if (part.type === 'image' && part.image) {
                return (
                  <div key={partIdx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <img
                      src={`data:${part.mimeType || 'image/png'};base64,${part.image}`}
                      alt="Uploaded"
                      className="max-w-[200px] max-h-[200px] rounded border"
                    />
                  </div>
                );
              }

              if (part.type !== 'text' || !part.text) {
                return null;
              }

              return (
                <div
                  key={partIdx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user'
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                      }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{part.text}</p>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                          code: ({ children, className }) => {
                            const isBlock = className?.includes('language-');
                            return isBlock ? (
                              <pre className="bg-zinc-200 dark:bg-zinc-700 rounded p-2 text-xs overflow-x-auto my-1">
                                <code>{children}</code>
                              </pre>
                            ) : (
                              <code className="bg-zinc-200 dark:bg-zinc-700 rounded px-1 text-xs">{children}</code>
                            );
                          },
                        }}
                      >
                        {part.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white dark:bg-zinc-950 p-3">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
          />
          {isLoading ? (
            <Button size="icon" variant="outline" onClick={stop} className="shrink-0">
              <div className="h-3 w-3 bg-zinc-900 dark:bg-zinc-100 rounded-sm" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
