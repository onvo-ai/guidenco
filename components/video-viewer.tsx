'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Play } from 'lucide-react';
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
  onRender?: () => Promise<void>;
  isRendering?: boolean;
}

type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

function codeFingerprint(v: {
  remotionCode: string;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
}): string {
  return `${v.remotionCode}|${v.width}|${v.height}|${v.durationInFrames}|${v.fps}`;
}

export function VideoViewer({ video, onVersionChange, onRender, isRendering }: VideoViewerProps) {
  const [viewingVersion, setViewingVersion] = useState(video?.currentVersion ?? 0);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [pendingDownload, setPendingDownload] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setViewingVersion(video?.currentVersion ?? 0);
  }, [video?.currentVersion, video?.id]);

  const versions = video?.versions ?? [];
  const activeVersion = versions[viewingVersion];
  const activeWidth = activeVersion?.width ?? video?.width;
  const activeHeight = activeVersion?.height ?? video?.height;
  const activeRemotionCode = activeVersion?.remotionCode ?? video?.remotionCode;

  const currentFingerprint = video
    ? codeFingerprint({
        remotionCode: activeRemotionCode ?? video.remotionCode,
        width: activeWidth ?? video.width ?? 1920,
        height: activeHeight ?? video.height ?? 1080,
        durationInFrames: video.durationInFrames,
        fps: video.fps,
      })
    : null;

  const canGoPrev = viewingVersion > 0;
  const canGoNext = viewingVersion < versions.length - 1;
  const versionLabel = useMemo(() => {
    if (!video) return '';
    return `v${viewingVersion + 1}`;
  }, [video, viewingVersion]);

  const setVersion = (idx: number) => {
    setViewingVersion(idx);
    onVersionChange?.(idx);
  };

  // Auto-build preview whenever code/settings change
  useEffect(() => {
    if (!video?.id || !video?.remotionCode) return;

    let cancelled = false;

    (async () => {
      setPreviewStatus('loading');
      setPreviewError(null);
      try {
        const res = await fetch('/api/videos/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: video.id }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error || 'Failed to build preview');
        }
        if (!cancelled) {
          setPreviewUrl(`/api/videos/preview/${video.id}/`);
          setPreviewStatus('ready');
          setPreviewKey((k) => k + 1);
        }
      } catch (e: any) {
        if (!cancelled) {
          setPreviewError(e.message);
          setPreviewStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [video?.id, currentFingerprint]);

  // Auto-download once render completes after user clicked download
  useEffect(() => {
    if (pendingDownload && video?.status === 'done' && video.videoUrl) {
      setPendingDownload(false);
      triggerDownload(video.videoUrl, video.title);
    }
  }, [pendingDownload, video?.status, video?.videoUrl]);

  // Poll the iframe DOM to hide the "Render via CLI" button after the React app renders it
  useEffect(() => {
    if (previewStatus !== 'ready') return;
    const interval = setInterval(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        const btn = [...doc.querySelectorAll('button')].find(
          (b) => (b as HTMLButtonElement).innerText?.trim().toLowerCase() === 'render via cli'
        ) as HTMLElement | undefined;
        if (btn) {
          const p = (btn.closest('li') || btn.parentElement) as HTMLElement | null;
          if (p && p !== doc.body) p.style.display = 'none';
          else btn.style.display = 'none';
          clearInterval(interval);
        }
      } catch {}
    }, 300);
    return () => clearInterval(interval);
  }, [previewStatus, previewKey]);

  function triggerDownload(url: string, title?: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'video'}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }

  const handleDownload = async () => {
    if (!video) return;
    if (video.videoUrl && video.status === 'done') {
      triggerDownload(video.videoUrl, video.title);
    } else {
      setPendingDownload(true);
      await onRender?.();
    }
  };

  // Version navigation bar
  const versionNav = versions.length > 1 && (
    <div className="flex items-center gap-2 h-10 px-3 border rounded-lg bg-white dark:bg-zinc-900 shadow-sm">
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
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                idx === viewingVersion
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
  );

  // Download button (renders first if needed)
  const downloadBtn = video?.remotionCode && (
    <Button
      variant="outline"
      className="h-10 gap-1.5 text-xs px-3"
      onClick={handleDownload}
      disabled={isRendering || pendingDownload}
    >
      {isRendering || pendingDownload ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Rendering…
        </>
      ) : (
        <>
          <Download className="h-3.5 w-3.5" />
          Download
        </>
      )}
    </Button>
  );

  // Preview content
  let previewContent: React.ReactNode;

  if (!video?.remotionCode) {
    previewContent = (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3 bg-zinc-950">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
          <Play className="w-7 h-7 ml-1 text-zinc-400" />
        </div>
        <p className="text-sm">No video yet</p>
        <p className="text-xs text-zinc-500">Use the chat to generate a video</p>
      </div>
    );
  } else if (previewStatus === 'loading') {
    previewContent = (
      <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-3 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Building preview…</p>
        <p className="text-xs text-zinc-400">This takes ~20 seconds</p>
      </div>
    );
  } else if (previewStatus === 'error') {
    previewContent = (
      <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center gap-3 text-red-400 px-6 text-center">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Preview failed</p>
        <p className="text-xs text-zinc-500 max-w-xs">{previewError}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPreviewStatus('idle')}
          className="gap-1.5 mt-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  } else if (previewStatus === 'ready' && previewUrl) {
    previewContent = (
      <div className="flex-1 relative overflow-hidden">
        <iframe
          ref={iframeRef}
          key={previewKey}
          src={previewUrl}
          className="w-full h-full border-0"
          allow="autoplay"
        />
      </div>
    );
  } else {
    previewContent = (
      <div className="flex-1 bg-zinc-950" />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 h-14 px-3 border-b bg-white dark:bg-zinc-950 shrink-0">
        <div className="w-4" />
        <div className="flex-1 flex justify-center">{versionNav}</div>
        <div>{downloadBtn}</div>
      </div>

      {previewContent}
    </div>
  );
}
