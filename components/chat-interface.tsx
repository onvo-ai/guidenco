'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Image as ImageIcon, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatInterfaceProps {
  projectId: string;
  selectedPageIndex: number;
  onArtworkUpdate: () => void;
}

export function ChatInterface({ projectId, selectedPageIndex, onArtworkUpdate }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<Array<{ url: string; file: File }>>([]);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const lastProcessedState = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/chat?projectId=${projectId}&pageIndex=${selectedPageIndex}` }),
    [projectId, selectedPageIndex]
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });

  // Load chat history on mount
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === 'submitted';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Extract artwork updates from messages
  useEffect(() => {
    if (messages.length === 0) return;

    let artworkWidth = 0;
    let artworkHeight = 0;
    let artworkHTML = '';
    let version = 0;
    let totalVersions = 0;

    // Process ALL messages from start to end to build up the artwork state
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.parts) continue;

      for (const part of message.parts) {
        const toolPart = part as any;

        // Handle nested output structure from database
        const output = toolPart.output?.output || toolPart.output;

        if (toolPart.type === 'tool-createArtwork' && output) {
          artworkWidth = output.width;
          artworkHeight = output.height;
        } else if (toolPart.type === 'tool-writeHTML' && output) {
          // Update HTML and version info
          artworkHTML = output.html;
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          // Also get dimensions if provided
          if (output.width) artworkWidth = output.width;
          if (output.height) artworkHeight = output.height;
        } else if (toolPart.type === 'tool-writePagesHTML' && output) {
          version = output.version ?? version;
          totalVersions = output.totalVersions ?? totalVersions;
          if (output.width) artworkWidth = output.width;
          if (output.height) artworkHeight = output.height;
        } else if (toolPart.type === 'tool-getArtworkState' && output) {
          // getArtworkState returns the full state - this is authoritative
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

    // Trigger artwork reload if we detected changes
    const currentState = `${artworkWidth}-${artworkHeight}-${artworkHTML}-${version}`;
    if (artworkWidth && artworkHeight && currentState !== lastProcessedState.current) {
      lastProcessedState.current = currentState;
      onArtworkUpdate();
    }
  }, [messages, onArtworkUpdate]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setAttachedImages((prev) => [...prev, { url, file }]);
      }
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedImages.length === 0) || isLoading) return;

    const parts: any[] = [];

    // Add images first
    for (const img of attachedImages) {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          // Extract just the base64 data without the data URL prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.readAsDataURL(img.file);
      });
      const base64 = await base64Promise;

      // Determine mime type
      const mimeType = img.file.type || 'image/png';

      parts.push({
        type: 'image',
        image: base64,
        mimeType: mimeType
      });
    }

    // Add text if present
    if (input.trim()) {
      parts.push({ type: 'text', text: input.trim() });
    }

    // Clear input and images immediately before sending
    setInput('');
    const imagesToCleanup = [...attachedImages];
    setAttachedImages([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Send message
    await sendMessage({ role: 'user', parts });

    // Cleanup image URLs
    imagesToCleanup.forEach(img => URL.revokeObjectURL(img.url));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-zinc-500 py-12">
              <h2 className="text-2xl font-semibold mb-2">Create Digital Assets with AI</h2>
              <p>Ask me to create graphics, illustrations, or any visual content using canvas!</p>
            </div>
          )}

          {messages.map((message) => {
            return (
              <div key={message.id} className="space-y-2">
                {/* Render parts in the order they appear */}
                {message.parts?.map((part: any, partIdx: number) => {
                  // Handle tool calls
                  if (part.type?.startsWith('tool-')) {
                    const toolName = part.type?.replace('tool-', '');
                    const output = part.output?.output || part.output;
                    const input = part.output?.input || part.args;

                    let displayMessage = output?.message || toolName;

                    if (toolName === 'createArtwork') {
                      const width = input?.width;
                      const height = input?.height;
                      if (width && height) {
                        displayMessage = `Artwork created with dimensions ${width}x${height}`;
                      }
                    } else if (toolName === 'writeHTML') {
                      displayMessage = output?.message || 'Writing HTML...';
                    } else if (toolName === 'writePagesHTML') {
                      const pageCount = output?.pageCount;
                      if (typeof pageCount === 'number') {
                        displayMessage = `Writing ${pageCount} pages...`;
                      } else {
                        displayMessage = output?.message || 'Writing pages...';
                      }
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
                    } else if (toolName === 'searchImage') {
                      // Try multiple paths to get the query
                      const searchQuery = input?.query || part.args?.query || output?.query;
                      if (searchQuery) {
                        displayMessage = `Searching for images: "${searchQuery}"`;
                      } else {
                        displayMessage = 'Searching for images...';
                      }
                    } else if (toolName === 'getArtworkState') {
                      displayMessage = 'Inspecting current artwork';
                    }

                    const hasImage = toolName === 'getArtworkState' && output?.image;

                    return (
                      <div key={partIdx} className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 w-full">
                          <span>
                            {toolName === 'createArtwork' && '🎨'}
                            {toolName === 'writeHTML' && '✏️'}
                            {toolName === 'writePagesHTML' && '✏️'}
                            {toolName === 'getArtworkState' && '👁️'}
                            {toolName === 'createPage' && '📄'}
                            {toolName === 'deletePage' && '🗑️'}
                            {toolName === 'searchImage' && '🔍'}
                          </span>
                          <span className="font-medium">{displayMessage}</span>
                        </div>
                        {hasImage && (
                          <div className="ml-8">
                            <img
                              src={output.image}
                              alt="Artwork preview"
                              className="max-w-[200px] max-h-[200px] rounded border border-zinc-200 dark:border-zinc-700 shadow-sm"
                            />
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Handle text
                  if (part.type === 'text' && part.text) {
                    return (
                      <div key={partIdx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                          }`}>
                          <div className={`prose prose-sm max-w-none ${message.role === 'user' ? 'prose-invert' : 'dark:prose-invert'
                            }`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {part.text}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Handle images
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
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Image previews */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachedImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img.url}
                    alt="Attached"
                    className="h-20 w-20 object-cover rounded border"
                  />
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="mb-0.5"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to create something... (Shift+Enter for new line)"
              disabled={isLoading}
              className="flex-1 min-h-[44px] max-h-[200px] resize-none overflow-y-auto"
              rows={1}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
            />
            <Button
              type="submit"
              disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
              size="icon"
              className="mb-0.5"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
