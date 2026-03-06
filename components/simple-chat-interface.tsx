'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SimpleChatInterfaceProps {
  projectId: string;
  apiEndpoint: string;
  onUpdate: () => void;
  placeholder?: string;
  historyEndpoint?: string;
}

export function SimpleChatInterface({
  projectId,
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
    () => new DefaultChatTransport({ api: `${apiEndpoint}?projectId=${projectId}` }),
    [apiEndpoint, projectId]
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({ transport });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Load message history
  useEffect(() => {
    const endpoint = historyEndpoint ?? `/api/messages?projectId=${projectId}`;
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
  }, [projectId, historyEndpoint]);

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
    sendMessage({ role: 'user', content: text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Start a conversation to generate content
          </div>
        )}
        {messages.map((msg) => {
          const textContent = typeof msg.content === 'string'
            ? msg.content
            : (msg.parts || [])
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('');

          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{textContent}</p>
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
                    {textContent}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          );
        })}
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
