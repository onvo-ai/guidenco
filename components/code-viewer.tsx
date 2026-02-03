'use client';

import { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { splitPages } from '@/lib/utils';
import { FileCode } from 'lucide-react';

interface CodeViewerProps {
  versions: Array<{ html: string; timestamp: number; googleFonts?: string[] }>;
  currentVersion: number;
  selectedPageIndex: number;
  onSelectedPageIndexChange: (pageIndex: number) => void;
}

export function CodeViewer({
  versions,
  currentVersion,
  selectedPageIndex,
  onSelectedPageIndexChange,
}: CodeViewerProps) {
  const template = versions[currentVersion]?.html || '';

  const pages = useMemo(() => {
    return splitPages(template);
  }, [template]);

  const pageTemplate = pages[selectedPageIndex] || '';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center bg-[#252526] overflow-x-auto h-9 shrink-0">
        {pages.map((_, idx) => (
          <button
            key={idx}
            onClick={() => onSelectedPageIndexChange(idx)}
            className={`flex items-center gap-2 px-4 h-full text-[13px] border-r border-[#1e1e1e] transition-colors relative min-w-[120px] max-w-[200px] ${idx === selectedPageIndex
              ? 'bg-[#1e1e1e] text-[#ffffff]'
              : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
              }`}
          >
            {idx === selectedPageIndex && (
              <div className="absolute top-0 left-0 right-0 h-px bg-blue-500" />
            )}
            <FileCode className="h-4 w-4 text-orange-500" />
            <span className="truncate">page-{idx + 1}.html</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
        <Editor
          height="100%"
          defaultLanguage="html"
          theme="vs-dark"
          value={pageTemplate || '<!-- No template yet -->'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            padding: { top: 0, bottom: 0 },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10
            }
          }}
        />
      </div>
    </div>
  );
}
