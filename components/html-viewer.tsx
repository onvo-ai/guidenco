'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import Handlebars from 'handlebars';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { splitPages } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HTMLViewerProps {
  width: number;
  height: number;
  versions: Array<{ html: string; timestamp: number; googleFonts?: string[] }>;
  currentVersion: number;
  selectedPageIndex: number;
  onSelectedPageIndexChange: (pageIndex: number) => void;
}

export function HTMLViewer({
  width,
  height,
  versions,
  currentVersion,
  selectedPageIndex,
  onSelectedPageIndexChange,
}: HTMLViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewingVersion, setViewingVersion] = useState(currentVersion);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'building' | 'zipping' | 'success' | 'error'>(
    'idle'
  );
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [exportErrorMessage, setExportErrorMessage] = useState('');

  // Update viewing version when current version changes
  useEffect(() => {
    setViewingVersion(currentVersion);
  }, [currentVersion]);

  const template = versions[viewingVersion]?.html || '';

  const pages = useMemo(() => {
    return splitPages(template);
  }, [template]);

  useEffect(() => {
    const clamped = Math.min(Math.max(0, selectedPageIndex), Math.max(0, pages.length - 1));
    if (clamped !== selectedPageIndex) {
      onSelectedPageIndexChange(clamped);
    }
  }, [pages.length, selectedPageIndex, onSelectedPageIndexChange]);

  const pageTemplate = pages[selectedPageIndex] || '';

  // Memoize googleFonts to prevent unnecessary re-renders
  const googleFonts = useMemo(() => {
    return versions[viewingVersion]?.googleFonts || [];
  }, [versions, viewingVersion]);

  const canGoPrev = viewingVersion > 0;
  const canGoNext = viewingVersion < versions.length - 1;

  // Register Handlebars helpers
  useEffect(() => {
    // Helper to create a range of numbers
    Handlebars.registerHelper('range', function (start: number, end: number) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    });

    // Helper to check if a number is odd
    Handlebars.registerHelper('odd', function (value: number) {
      return value % 2 === 1;
    });

    // Helper to check if a number is even
    Handlebars.registerHelper('even', function (value: number) {
      return value % 2 === 0;
    });

    return () => {
      Handlebars.unregisterHelper('range');
      Handlebars.unregisterHelper('odd');
      Handlebars.unregisterHelper('even');
    };
  }, []);

  const compiledPages = useMemo(() => {
    // Provide sample data for preview
    const sampleData = {
      title: 'Sample Title',
      description: 'Sample Description',
      items: ['Item 1', 'Item 2', 'Item 3'],
      user: { name: 'John Doe', email: 'john@example.com' },
      count: 5,
      isActive: true,
    };

    return pages.map((page) => {
      if (!page) return '';
      try {
        const hbsTemplate = Handlebars.compile(page);
        return hbsTemplate(sampleData);
      } catch (error) {
        console.error('Handlebars compilation error:', error);
        return page;
      }
    });
  }, [pages]);

  const googleFontsLink = useMemo(() => {
    return googleFonts.length > 0
      ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${googleFonts
        .map((font) => `family=${font.replace(/ /g, '+')}:wght@400;700`)
        .join('&')}&display=swap" rel="stylesheet">`
      : '';
  }, [googleFonts]);

  const buildFullHTML = (compiledHTML: string) => {
    return `
<!DOCTYPE html>
<html style="background: transparent;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  ${googleFontsLink}
  <style>
    /* Ensure absolute transparency */
    :root {
      color-scheme: light dark;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: transparent !important;
      background-color: transparent !important;
    }
    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }
  </style>
</head>
<body style="background: transparent;">
  ${compiledHTML}
</body>
</html>
    `;
  };

  const downloadHTML = () => {
    // Build Google Fonts link if fonts are specified
    const googleFontsLink = googleFonts.length > 0
      ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${googleFonts
        .map((font) => `family=${font.replace(/ /g, '+')}:wght@400;700`)
        .join('&')}&display=swap" rel="stylesheet">`
      : '';

    const fullHTML = `
<!DOCTYPE html>
<html style="background: transparent !important;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  ${googleFontsLink}
  <style>
    body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      background: transparent !important;
    }
    html, body {
      background: transparent !important;
    }
  </style>
</head>
<body style="background: transparent !important;">
  ${compiledPages[selectedPageIndex] || ''}
</body>
</html>
    `;

    const blob = new Blob([fullHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `artiste-${Date.now()}.html`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    try {
      setExportTitle('Exporting PDF');
      setExportModalOpen(true);
      setExportStatus('rendering');
      setExportErrorMessage('');
      setExportProgress({ current: 0, total: pages.length });

      // Use the server renderer so PDF output matches exactly what preview/download PNG would produce.
      const renderedImages: Array<{ dataUrl: string; width: number; height: number }> = [];

      for (let idx = 0; idx < pages.length; idx++) {
        setExportProgress({ current: idx, total: pages.length });
        const pageHtml = pages[idx] || '';
        const renderResponse = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: pageHtml,
            width,
            height,
            format: 'base64',
            googleFonts,
            scale: 2,
          }),
        });

        if (!renderResponse.ok) {
          throw new Error(`Failed to render page ${idx + 1}`);
        }

        const data = await renderResponse.json();
        if (!data?.image || typeof data.image !== 'string') {
          throw new Error(`Invalid render response for page ${idx + 1}`);
        }

        renderedImages.push({ dataUrl: data.image, width, height });
      }

      setExportProgress({ current: pages.length, total: pages.length });
      setExportStatus('building');

      if (renderedImages.length === 0) {
        throw new Error('No pages to export');
      }

      const orientation = width >= height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [width, height],
        compress: true,
      });

      renderedImages.forEach((img, idx) => {
        if (idx > 0) {
          pdf.addPage([img.width, img.height], orientation);
        }
        pdf.addImage(img.dataUrl, 'PNG', 0, 0, img.width, img.height);
      });

      pdf.save(`artiste-${Date.now()}.pdf`);
      setExportStatus('success');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      const message = error instanceof Error ? error.message : 'Failed to download PDF. Please try again.';
      setExportErrorMessage(message);
      setExportStatus('error');
    }
  };

  const downloadPNGsAsZip = async () => {
    try {
      setExportTitle('Exporting PNGs');
      setExportModalOpen(true);
      setExportStatus('rendering');
      setExportErrorMessage('');
      setExportProgress({ current: 0, total: pages.length });

      const zip = new JSZip();
      const folder = zip.folder('png')!;

      for (let idx = 0; idx < pages.length; idx++) {
        setExportProgress({ current: idx, total: pages.length });
        const pageHtml = pages[idx] || '';
        const response = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: pageHtml,
            width,
            height,
            format: 'binary',
            googleFonts,
            scale: 2,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to render page ${idx + 1}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        folder.file(`page-${idx + 1}.png`, arrayBuffer);
      }

      setExportProgress({ current: pages.length, total: pages.length });
      setExportStatus('zipping');

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.download = `artiste-${Date.now()}-png.zip`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      setExportStatus('success');
    } catch (error) {
      console.error('Error downloading PNG zip:', error);
      const message = error instanceof Error ? error.message : 'Failed to download PNG zip. Please try again.';
      setExportErrorMessage(message);
      setExportStatus('error');
    }
  };

  const downloadSVGsAsZip = async () => {
    try {
      setExportTitle('Exporting SVGs');
      setExportModalOpen(true);
      setExportStatus('building');
      setExportErrorMessage('');
      setExportProgress({ current: 0, total: pages.length });

      const zip = new JSZip();
      const folder = zip.folder('svg')!;

      for (let idx = 0; idx < compiledPages.length; idx++) {
        setExportProgress({ current: idx, total: compiledPages.length });
        const compiled = compiledPages[idx] || '';

        const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px;">
      ${compiled}
    </div>
  </foreignObject>
</svg>
        `.trim();

        folder.file(`page-${idx + 1}.svg`, svgContent);
      }

      setExportProgress({ current: compiledPages.length, total: compiledPages.length });
      setExportStatus('zipping');

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.download = `artiste-${Date.now()}-svg.zip`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      setExportStatus('success');
    } catch (error) {
      console.error('Error downloading SVG zip:', error);
      const message = error instanceof Error ? error.message : 'Failed to download SVG zip. Please try again.';
      setExportErrorMessage(message);
      setExportStatus('error');
    }
  };

  const downloadPNG = async () => {
    if (pages.length > 1) {
      await downloadPNGsAsZip();
      return;
    }
    try {
      // Use the unified rendering API with 2x upscaling for better quality
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: pageTemplate,
          width,
          height,
          format: 'binary',
          googleFonts,
          scale: 2,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to render image');
      }

      // Download the image
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `artiste-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PNG:', error);
      alert('Failed to download PNG. Please try again.');
    }
  };

  const downloadSVG = () => {
    if (pages.length > 1) {
      void downloadSVGsAsZip();
      return;
    }
    // Create SVG with foreignObject containing the HTML
    const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px;">
      ${compiledPages[selectedPageIndex] || ''}
    </div>
  </foreignObject>
</svg>
    `;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `artiste-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrevVersion = () => {
    if (viewingVersion > 0) setViewingVersion((v) => v - 1);
  };

  const handleNextVersion = () => {
    if (viewingVersion < versions.length - 1) setViewingVersion((v) => v + 1);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 5));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.1));
  const handleResetZoom = () => {
    setZoom(1);
  };

  if (!template) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        No artwork created yet. Ask the AI to create one!
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Dialog
        open={exportModalOpen}
        onOpenChange={(open) => {
          // Prevent closing while actively rendering/building to avoid confusion.
          if (!open && (exportStatus === 'rendering' || exportStatus === 'building' || exportStatus === 'zipping')) return;
          setExportModalOpen(open);
          if (!open) {
            setExportStatus('idle');
            setExportErrorMessage('');
            setExportProgress({ current: 0, total: 0 });
            setExportTitle('');
          }
        }}
      >
        <DialogContent showCloseButton={exportStatus !== 'rendering' && exportStatus !== 'building' && exportStatus !== 'zipping'}>
          <DialogHeader>
            <DialogTitle>
              {exportStatus === 'success'
                ? 'Download ready'
                : exportStatus === 'error'
                  ? 'Export failed'
                  : exportTitle || 'Exporting'}
            </DialogTitle>
            <DialogDescription>
              {exportStatus === 'rendering'
                ? `Rendering pages (${Math.min(exportProgress.current + 1, Math.max(exportProgress.total, 1))} of ${Math.max(
                  exportProgress.total,
                  1
                )})`
                : exportStatus === 'building'
                  ? 'Building…'
                  : exportStatus === 'zipping'
                    ? 'Zipping files…'
                    : exportStatus === 'success'
                      ? 'Your download should start automatically.'
                      : exportStatus === 'error'
                        ? exportErrorMessage
                        : ''}
            </DialogDescription>
          </DialogHeader>

          {(exportStatus === 'rendering' || exportStatus === 'building' || exportStatus === 'zipping') && (
            <div className="space-y-2">
              <div className="h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-300 ease-out"
                  style={{
                    width: `${exportProgress.total > 0
                      ? Math.round((exportProgress.current / exportProgress.total) * 100)
                      : 0
                      }%`,
                  }}
                />
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {exportProgress.total > 0
                  ? `${Math.round((exportProgress.current / exportProgress.total) * 100)}%`
                  : '0%'}
              </div>
            </div>
          )}

          <DialogFooter>
            {(exportStatus === 'success' || exportStatus === 'error') && (
              <Button
                variant="outline"
                onClick={() => {
                  setExportModalOpen(false);
                  setExportStatus('idle');
                  setExportErrorMessage('');
                  setExportProgress({ current: 0, total: 0 });
                  setExportTitle('');
                }}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between gap-4 h-14 px-3 border-b bg-white dark:bg-zinc-950 shrink-0">
        {/* Left: Scale selector and zoom controls */}
        <div className="flex gap-1.5 items-center">
          <Button variant="outline" onClick={handleZoomOut} className="h-10 w-10 p-0">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="h-10 flex items-center justify-center px-3 min-w-[64px] bg-background border rounded-md">
            <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
          </div>
          <Button variant="outline" onClick={handleZoomIn} className="h-10 w-10 p-0">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleResetZoom} className="h-10 w-10 p-0">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: Version timeline */}
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
                    onClick={() => setViewingVersion(idx)}
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
                v{viewingVersion + 1}
              </span>
            </div>
          )}
        </div>

        {/* Right: Download dropdown */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 px-4 gap-2">
                <Download className="h-4 w-4" />
                <span className="text-sm font-medium">Download</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadPNG}>
                Download as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadPDF}>
                Download as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadSVG}>
                Download as SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadHTML}>
                Download as HTML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <div
            ref={containerRef}
            className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-900 p-8"
          >
            <div className="flex flex-col items-center gap-8" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
              {compiledPages.map((compiled, idx) => {
                const isActive = idx === selectedPageIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectedPageIndexChange(idx)}
                    className={`overflow-hidden text-left relative transition-all rounded-lg shadow-sm border ${isActive ? 'ring-2 ring-blue-500 ring-offset-2 border-blue-500 z-30' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    style={{ width: width }}
                  >
                    <div
                      className="px-3 py-1 text-[10px] font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100/90 dark:bg-zinc-800/90 backdrop-blur-sm absolute top-0 left-0 z-20 border-b border-r border-zinc-300/50 dark:border-zinc-600/50 rounded-br shadow-sm"
                    >
                      {idx + 1} / {compiledPages.length}
                    </div>
                    <div
                      className="relative overflow-hidden"
                      style={{
                        width: width,
                        height: height,
                        backgroundColor: '#ffffff',
                        backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                      }}
                    >
                      <iframe
                        title={`page-${idx + 1}`}
                        width={width}
                        height={height}
                        allowTransparency={true}
                        className="relative z-10 border-none block"
                        style={{
                          pointerEvents: 'none',
                          backgroundColor: 'transparent',
                          background: 'transparent'
                        }}
                        srcDoc={buildFullHTML(compiled)}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
