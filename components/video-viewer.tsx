'use client';

import { useState, useEffect } from 'react';
import { Play, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Editor from '@monaco-editor/react';

interface VideoData {
  id: string;
  title?: string;
  remotionCode: string;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
  videoUrl?: string | null;
  status: string;
}

interface VideoViewerProps {
  video: VideoData | null;
  onRender?: () => void;
  isRendering?: boolean;
  onSave?: (code: string) => Promise<void>;
}

export function VideoViewer({ video, onRender, isRendering, onSave }: VideoViewerProps) {
  const [showCode, setShowCode] = useState(false);
  const [editedCode, setEditedCode] = useState(video?.remotionCode ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (video?.remotionCode) setEditedCode(video.remotionCode);
  }, [video?.remotionCode]);

  const hasChanges = editedCode !== (video?.remotionCode ?? '');

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(editedCode);
    } finally {
      setIsSaving(false);
    }
  };

  const duration = video ? (video.durationInFrames / video.fps).toFixed(1) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-white dark:bg-zinc-950 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]">
            {video?.title || 'Untitled Video'}
          </span>
          {video && (
            <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full whitespace-nowrap">
              {video.width}x{video.height} · {duration}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center h-8 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
            <button
              onClick={() => setShowCode(false)}
              className={`px-3 h-full text-xs font-medium rounded-md transition-all ${
                !showCode
                  ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setShowCode(true)}
              className={`px-3 h-full text-xs font-medium rounded-md transition-all ${
                showCode
                  ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Code
            </button>
          </div>
          {video && video.status !== 'done' && onRender && (
            <Button
              size="sm"
              onClick={onRender}
              disabled={isRendering || video.status === 'rendering'}
              className="gap-1.5"
            >
              {isRendering || video.status === 'rendering' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Rendering...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Render
                </>
              )}
            </Button>
          )}
          {video?.status === 'done' && video.videoUrl && onRender && (
            <Button size="sm" variant="outline" onClick={onRender} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Re-render
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {showCode ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={editedCode || ''}
              onChange={(val) => setEditedCode(val ?? '')}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                fontSize: 13,
                padding: { top: 8, bottom: 8 },
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                scrollbar: {
                  vertical: 'visible',
                  horizontal: 'visible',
                  useShadows: false,
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10,
                },
              }}
            />
          </div>
          {hasChanges && onSave && (
            <div className="p-3 border-t bg-white dark:bg-zinc-950 flex justify-end gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditedCode(video?.remotionCode ?? '')}
              >
                Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </div>
      ) : !video || !video.remotionCode ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3 bg-zinc-950">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
            <Play className="w-7 h-7 ml-1 text-zinc-400" />
          </div>
          <p className="text-sm">No video yet</p>
          <p className="text-xs text-zinc-500">Use the chat to generate a Remotion video</p>
        </div>
      ) : video.status === 'done' && video.videoUrl ? (
        <div className="flex-1 bg-zinc-950 flex items-center justify-center">
          <video
            src={video.videoUrl}
            controls
            className="max-w-full max-h-full"
            style={{ aspectRatio: `${video.width}/${video.height}` }}
          />
        </div>
      ) : video.status === 'rendering' ? (
        <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-3 text-white">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Rendering video...</p>
        </div>
      ) : video.status === 'error' ? (
        <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-3 text-red-400">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">Render failed</p>
          {onRender && (
            <Button size="sm" variant="outline" onClick={onRender}>
              Try Again
            </Button>
          )}
        </div>
      ) : (
        <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-400 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
            <Play className="h-6 w-6 ml-0.5" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-300 mb-1">Remotion code ready</p>
            <p className="text-xs text-zinc-500">Click Render to compile and generate the video</p>
          </div>
        </div>
      )}
    </div>
  );
}
