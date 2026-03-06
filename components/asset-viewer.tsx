'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssetViewerProps {
  svgContent: string;
  title?: string;
}

export function AssetViewer({ svgContent, title }: AssetViewerProps) {
  const [zoom, setZoom] = useState(1);

  const handleDownload = () => {
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'asset'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!svgContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        </div>
        <p className="text-sm">No SVG asset yet</p>
        <p className="text-xs text-zinc-500">Use the chat to generate an SVG</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-white dark:bg-zinc-950 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
            {title || 'Untitled Asset'}
          </span>
          <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">SVG</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
              className="w-6 h-6 flex items-center justify-center text-xs font-medium hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
            >
              −
            </button>
            <span className="text-xs font-medium px-1 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(4, z + 0.25))}
              className="w-6 h-6 flex items-center justify-center text-xs font-medium hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
            >
              +
            </button>
            <button
              onClick={() => setZoom(1)}
              className="w-6 h-6 flex items-center justify-center text-xs font-medium hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
            >
              ↺
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* SVG Preview */}
      <div className="flex-1 overflow-auto bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] flex items-center justify-center">
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          className="drop-shadow-lg"
        />
      </div>
    </div>
  );
}
