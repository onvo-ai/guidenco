'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import Handlebars from 'handlebars';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
}

export function HTMLViewer({ width, height, versions, currentVersion }: HTMLViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewingVersion, setViewingVersion] = useState(currentVersion);

  // Update viewing version when current version changes
  useEffect(() => {
    setViewingVersion(currentVersion);
  }, [currentVersion]);

  const template = versions[viewingVersion]?.html || '';
  
  // Memoize googleFonts to prevent unnecessary re-renders
  const googleFonts = useMemo(() => {
    return versions[viewingVersion]?.googleFonts || [];
  }, [versions, viewingVersion]);
  
  const canGoPrev = viewingVersion > 0;
  const canGoNext = viewingVersion < versions.length - 1;

  // Register Handlebars helpers
  useEffect(() => {
    // Helper to create a range of numbers
    Handlebars.registerHelper('range', function(start: number, end: number) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    });

    // Helper to check if a number is odd
    Handlebars.registerHelper('odd', function(value: number) {
      return value % 2 === 1;
    });

    // Helper to check if a number is even
    Handlebars.registerHelper('even', function(value: number) {
      return value % 2 === 0;
    });
  }, []);

  // Compile Handlebars template with sample data
  const compiledHTML = template ? (() => {
    try {
      const hbsTemplate = Handlebars.compile(template);
      // Provide sample data for preview
      const sampleData = {
        title: 'Sample Title',
        description: 'Sample Description',
        items: ['Item 1', 'Item 2', 'Item 3'],
        user: { name: 'John Doe', email: 'john@example.com' },
        count: 5,
        isActive: true,
      };
      return hbsTemplate(sampleData);
    } catch (error) {
      console.error('Handlebars compilation error:', error);
      return template; // Fallback to raw template if compilation fails
    }
  })() : '';

  useEffect(() => {
    if (!iframeRef.current || !compiledHTML) return;

    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (!iframeDoc) return;

    // Build Google Fonts link if fonts are specified
    const googleFontsLink = googleFonts.length > 0
      ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${googleFonts.map(font => `family=${font.replace(/ /g, '+')}:wght@400;700`).join('&')}&display=swap" rel="stylesheet">`
      : '';

    // Build complete HTML document with Tailwind, FontAwesome, and Google Fonts
    // The body is set to base dimensions, then scaled up with CSS transform
    const fullHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  ${googleFontsLink}
  <style>
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      width: ${width}px;
      height: ${height}px;
    }
  </style>
</head>
<body>
  ${compiledHTML}
</body>
</html>
    `;

    iframeDoc.open();
    iframeDoc.write(fullHTML);
    iframeDoc.close();
  }, [width, height, compiledHTML, googleFonts]);

  const downloadHTML = () => {
    // Build Google Fonts link if fonts are specified
    const googleFontsLink = googleFonts.length > 0
      ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${googleFonts.map(font => `family=${font.replace(/ /g, '+')}:wght@400;700`).join('&')}&display=swap" rel="stylesheet">`
      : '';

    const fullHTML = `
<!DOCTYPE html>
<html>
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
    }
  </style>
</head>
<body>
  ${compiledHTML}
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

  const downloadPNG = async () => {
    try {
      // Use the unified rendering API with 2x upscaling for better quality
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
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
    // Create SVG with foreignObject containing the HTML
    const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; height: ${height}px;">
      ${compiledHTML}
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
    if (canGoPrev) setViewingVersion(v => v - 1);
  };

  const handleNextVersion = () => {
    if (canGoNext) setViewingVersion(v => v + 1);
  };

  if (!template) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        No artwork created yet. Ask the AI to create one!
      </div>
    );
  }

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(prev => Math.min(Math.max(0.1, prev + delta), 5));
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <Tabs 
        defaultValue="preview" 
        className="flex flex-col h-full"
        onValueChange={(value) => {
          if (value === 'preview') {
            setTimeout(() => {
              if (iframeRef.current && compiledHTML) {
                const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                if (iframeDoc) {
                  const fullHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  ${compiledHTML}
</body>
</html>
                  `;
                  iframeDoc.open();
                  iframeDoc.write(fullHTML);
                  iframeDoc.close();
                }
              }
            }, 0);
          }
        }}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Tabs */}
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
          </TabsList>
          
          {/* Center: Scale selector and zoom controls */}
          <div className="flex gap-4 items-center">
            {/* Zoom controls */}
            <div className="flex gap-2 items-center">
              <Button size="sm" variant="outline" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2 py-1 min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="outline" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleResetZoom}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Right: Download dropdown */}
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={downloadPNG}>
                  Download as PNG
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

        <TabsContent value="preview" className="flex-1 mt-4 overflow-hidden flex flex-col gap-2">
          <div 
            ref={containerRef}
            className="flex-1 overflow-hidden border rounded-lg bg-zinc-50 dark:bg-zinc-900 p-4 select-none"
            style={{ 
              cursor: isPanning ? 'grabbing' : 'grab',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: `${width / 2}px ${height / 2}px`,
                transition: isPanning ? 'none' : 'transform 0.1s',
                display: 'inline-block',
                pointerEvents: 'none',
              }}
            >
              <iframe
                ref={iframeRef}
                width={width}
                height={height}
                className="border bg-white"
                style={{
                  background: `
                    repeating-conic-gradient(#e5e5e5 0% 25%, #ffffff 0% 50%) 
                    50% / 20px 20px
                  `,
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
          
          {/* Version timeline */}
          {versions.length > 1 && (
            <div className="flex items-center justify-center gap-2 py-2 px-4 border rounded-lg bg-white dark:bg-zinc-900">
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handlePrevVersion}
                disabled={!canGoPrev}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1 px-2">
                {versions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setViewingVersion(idx)}
                    className="relative group"
                  >
                    <div 
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === viewingVersion 
                          ? 'bg-blue-600 scale-125' 
                          : 'bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400'
                      }`}
                    />
                    {idx < versions.length - 1 && (
                      <div className="absolute top-1/2 left-2 w-4 h-0.5 bg-zinc-200 dark:bg-zinc-700 -translate-y-1/2" />
                    )}
                  </button>
                ))}
              </div>
              
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleNextVersion}
                disabled={!canGoNext}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              <span className="text-xs text-zinc-500 ml-2">
                v{viewingVersion + 1} / {versions.length}
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="html" className="flex-1 mt-4 overflow-hidden">
          <div className="h-full overflow-auto border rounded-lg bg-zinc-900 p-4">
            <pre className="text-sm text-zinc-100 font-mono">
              <code>{template || '<!-- No template yet -->'}</code>
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
