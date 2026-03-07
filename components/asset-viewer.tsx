'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AssetViewerProps {
  versions: Array<{ svgContent: string; title: string; width: number; height: number; timestamp: number }>;
  currentVersion: number;
  onVersionChange?: (version: number) => void;
}

export function AssetViewer({ versions, currentVersion, onVersionChange }: AssetViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [viewingVersion, setViewingVersion] = useState(currentVersion);

  useEffect(() => {
    setViewingVersion(currentVersion);
  }, [currentVersion]);

  const currentAsset = versions[viewingVersion];
  const svgContent = currentAsset?.svgContent || '';
  const title = currentAsset?.title;
  const assetWidth = currentAsset?.width ?? 1024;
  const assetHeight = currentAsset?.height ?? 1024;
  const canGoPrev = viewingVersion > 0;
  const canGoNext = viewingVersion < versions.length - 1;

  const setVersion = (version: number) => {
    setViewingVersion(version);
    onVersionChange?.(version);
  };

  const versionLabel = useMemo(() => {
    if (versions.length === 0) return 'No versions';
    return `v${viewingVersion + 1}`;
  }, [versions.length, viewingVersion]);

  const downloadBlob = (content: BlobPart, mimeType: string, fileName: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSVG = () => {
    downloadBlob(svgContent, 'image/svg+xml', `${title || 'asset'}.svg`);
  };

  const downloadRaster = async (format: 'png' | 'jpeg') => {
    if (!svgContent) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.documentElement;
    const widthAttr = Number(svgElement.getAttribute('width'));
    const heightAttr = Number(svgElement.getAttribute('height'));
    const viewBox = svgElement.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [];

    const width = Number.isFinite(widthAttr) && widthAttr > 0
      ? widthAttr
      : (viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : assetWidth);
    const height = Number.isFinite(heightAttr) && heightAttr > 0
      ? heightAttr
      : (viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : assetHeight);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' }));

    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        ctx.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(svgUrl);
        resolve();
      };
      image.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error(`Failed to render SVG as ${format.toUpperCase()}`));
      };
      image.src = svgUrl;
    });

    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, 0.92);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${title || 'asset'}.${format === 'png' ? 'png' : 'jpg'}`;
    a.click();
  };

  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.25));
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 5));
  const handleResetZoom = () => setZoom(1);
  const handlePrevVersion = () => {
    if (canGoPrev) setVersion(viewingVersion - 1);
  };
  const handleNextVersion = () => {
    if (canGoNext) setVersion(viewingVersion + 1);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 h-14 px-3 border-b bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex gap-1.5 items-center">
          <Button variant="outline" onClick={handleZoomOut} className="h-10 w-10 p-0" disabled={!svgContent}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="h-10 flex items-center justify-center px-3 min-w-[64px] bg-background border rounded-md">
            <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
          </div>
          <Button variant="outline" onClick={handleZoomIn} className="h-10 w-10 p-0" disabled={!svgContent}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleResetZoom} className="h-10 w-10 p-0" disabled={!svgContent}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 flex justify-center">
          {versions.length > 1 && (
            <div className="flex items-center gap-2 h-10 px-3 border rounded-lg bg-white dark:bg-zinc-900 shadow-sm">
              <Button
                variant="ghost"
                onClick={handlePrevVersion}
                disabled={!canGoPrev}
                className="h-10 w-10 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1 px-1">
                {versions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setVersion(idx)}
                    className="relative group h-10 flex items-center px-0.5"
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full transition-all ${idx === viewingVersion
                        ? 'bg-blue-600 scale-125'
                        : 'bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400'
                        }`}
                    />
                  </button>
                ))}
              </div>

              <Button
                variant="ghost"
                onClick={handleNextVersion}
                disabled={!canGoNext}
                className="h-10 w-10 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <span className="text-xs font-medium text-zinc-500 min-w-[45px] text-right">
                {versionLabel}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {svgContent && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 w-10 p-0">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void downloadRaster('png')}>
                  Download as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadRaster('jpeg')}>
                  Download as JPEG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadSVG}>
                  Download as SVG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      {!svgContent ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </div>
          <p className="text-sm">No SVG asset yet</p>
          <p className="text-xs text-zinc-500">Use the chat to generate an SVG</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-size-[20px_20px] flex items-center justify-center">
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className="drop-shadow-lg"
          />
        </div>
      )}
    </div>
  );
}
