'use client';

import { Play, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

export function VideoViewer({ video, onRender, isRendering }: VideoViewerProps) {
  if (!video || !video.remotionCode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <Play className="w-7 h-7 ml-1" />
        </div>
        <p className="text-sm">No video yet</p>
        <p className="text-xs text-zinc-500">Use the chat to generate a Remotion video</p>
      </div>
    );
  }

  const duration = (video.durationInFrames / video.fps).toFixed(1);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-white dark:bg-zinc-950 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]">
            {video.title || 'Untitled Video'}
          </span>
          <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full whitespace-nowrap">
            {video.width}×{video.height} · {duration}s
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {video.status !== 'done' && onRender && (
            <Button
              size="sm"
              onClick={onRender}
              disabled={isRendering || video.status === 'rendering'}
              className="gap-1.5"
            >
              {isRendering || video.status === 'rendering' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Rendering…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Render
                </>
              )}
            </Button>
          )}
          {video.status === 'done' && video.videoUrl && onRender && (
            <Button size="sm" variant="outline" onClick={onRender} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Re-render
            </Button>
          )}
        </div>
      </div>

      {/* Video Preview */}
      <div className="flex-1 overflow-hidden bg-zinc-950 flex items-center justify-center relative">
        {video.status === 'done' && video.videoUrl ? (
          <video
            src={video.videoUrl}
            controls
            className="max-w-full max-h-full"
            style={{ aspectRatio: `${video.width}/${video.height}` }}
          />
        ) : video.status === 'rendering' ? (
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Rendering video…</p>
          </div>
        ) : video.status === 'error' ? (
          <div className="flex flex-col items-center gap-3 text-red-400">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Render failed</p>
            {onRender && (
              <Button size="sm" variant="outline" onClick={onRender}>
                Try Again
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-zinc-400 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
              <Play className="h-6 w-6 ml-0.5" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300 mb-1">Remotion code ready</p>
              <p className="text-xs text-zinc-500">
                Click Render to compile and generate the video
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
