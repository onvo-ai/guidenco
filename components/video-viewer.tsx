'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play, Loader2, AlertCircle, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  currentVersion?: number;
  versions?: Array<{
    title: string;
    remotionCode: string;
    width: number;
    height: number;
    durationInFrames: number;
    fps: number;
    timestamp: number;
  }>;
}

interface VideoViewerProps {
  video: VideoData | null;
  onVersionChange?: (version: number) => void;
}

export function VideoViewer({ video, onVersionChange }: VideoViewerProps) {
  const [viewingVersion, setViewingVersion] = useState(video?.currentVersion ?? 0);

  useEffect(() => {
    setViewingVersion(video?.currentVersion ?? 0);
  }, [video?.currentVersion, video?.id]);

  const versions = video?.versions ?? [];
  const activeVersion = versions[viewingVersion];
  const activeTitle = activeVersion?.title ?? video?.title;
  const activeWidth = activeVersion?.width ?? video?.width;
  const activeHeight = activeVersion?.height ?? video?.height;
  const activeDurationInFrames = activeVersion?.durationInFrames ?? video?.durationInFrames;
  const activeFps = activeVersion?.fps ?? video?.fps;
  const activeRemotionCode = activeVersion?.remotionCode ?? video?.remotionCode;
  const canGoPrev = viewingVersion > 0;
  const canGoNext = viewingVersion < versions.length - 1;
  const versionLabel = useMemo(() => {
    if (!video) return 'No versions';
    return `v${viewingVersion + 1}`;
  }, [video, viewingVersion]);

  const setVersion = (versionIndex: number) => {
    setViewingVersion(versionIndex);
    onVersionChange?.(versionIndex);
  };

  const downloadVideo = () => {
    if (!video?.videoUrl) return;
    const a = document.createElement('a');
    a.href = video.videoUrl;
    a.download = `${video.title || 'video'}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 h-14 px-3 border-b bg-white dark:bg-zinc-950 shrink-0">
        <div className="w-10" />

        <div className="flex-1 flex justify-center">
          {versions.length > 1 && (
            <div className="flex items-center gap-2 h-10 px-3 border rounded-lg bg-white dark:bg-zinc-900 shadow-sm max-w-full">
              <Button
                variant="ghost"
                onClick={() => canGoPrev && setVersion(viewingVersion - 1)}
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
                onClick={() => canGoNext && setVersion(viewingVersion + 1)}
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
          {video?.status === 'done' && video.videoUrl && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 w-10 p-0">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={downloadVideo}>
                  Download as MP4
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      {!video || !activeRemotionCode ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3 bg-zinc-950">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
            <Play className="w-7 h-7 ml-1 text-zinc-400" />
          </div>
          <p className="text-sm">No video yet</p>
          <p className="text-xs text-zinc-500">Use the chat to generate a video</p>
        </div>
      ) : video.status === 'done' && video.videoUrl ? (
        <div className="flex-1 bg-zinc-950 flex items-center justify-center">
          <video
            src={video.videoUrl}
            controls
            className="max-w-full max-h-full"
            style={{ aspectRatio: `${activeWidth}/${activeHeight}` }}
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
        </div>
      ) : (
        <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-400 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
            <Play className="h-6 w-6 ml-0.5" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-300 mb-1">Video ready</p>
            <p className="text-xs text-zinc-500">Rendering will start automatically once the latest update is saved</p>
          </div>
        </div>
      )}
    </div>
  );
}
