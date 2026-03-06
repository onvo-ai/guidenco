'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface VisualMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: string;
}

export function VisualMarkdownEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  disabled = false,
  height = "400px"
}: VisualMarkdownEditorProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Preview Only */}
      <div style={{ height }} className="relative">
        <div className="h-full overflow-y-auto p-6 bg-white dark:bg-zinc-900">
          <div className="max-w-none">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({children}) => <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">{children}</h1>,
                h2: ({children}) => <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3 mt-6">{children}</h2>,
                h3: ({children}) => <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2 mt-4">{children}</h3>,
                h4: ({children}) => <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2 mt-3">{children}</h4>,
                p: ({children}) => <p className="text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed">{children}</p>,
                ul: ({children}) => <ul className="list-disc list-inside mb-4 text-zinc-700 dark:text-zinc-300 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal list-inside mb-4 text-zinc-700 dark:text-zinc-300 space-y-1">{children}</ol>,
                li: ({children}) => <li>{children}</li>,
                strong: ({children}) => <strong className="font-bold text-zinc-900 dark:text-zinc-100">{children}</strong>,
                em: ({children}) => <em className="italic text-zinc-800 dark:text-zinc-200">{children}</em>,
                code: ({children}) => <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                pre: ({children}) => <pre className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg overflow-x-auto mb-4"><code className="text-sm font-mono text-zinc-800 dark:text-zinc-200">{children}</code></pre>,
                blockquote: ({children}) => <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 py-2 mb-4 text-zinc-600 dark:text-zinc-400 italic">{children}</blockquote>,
                a: ({children, href}) => <a href={href} className="text-blue-600 dark:text-blue-400 hover:underline">{children}</a>,
                hr: () => <hr className="border-zinc-200 dark:border-zinc-700 my-6" />,
              }}
            >
              {value || placeholder}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
