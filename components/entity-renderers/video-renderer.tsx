"use client";

import { Loader2, Download } from "lucide-react";
import { PromptLabel } from "./shared";
import type {
  VersionNode,
  NodeContentProps,
  DetailContentProps,
  EntityRenderer,
} from "./types";

export function downloadVideo(videoUrl: string, title?: string) {
  const a = document.createElement("a");
  a.href = videoUrl;
  a.download = `${title || "video"}.mp4`;
  a.click();
}

// NODE_W constant matches version-flow-canvas layout constant
const NODE_W = 280;

function VideoNodeContent({ version }: NodeContentProps) {
  const aspectRatio =
    version.width && version.height ? version.height / version.width : 9 / 16;
  const previewHeight = Math.round(NODE_W * aspectRatio);
  const isError = version.videoStatus === "error" || version.status === "error";

  return (
    <>
      <div
        className="relative bg-zinc-900 flex items-center justify-center"
        style={{ height: previewHeight }}
      >
        {version.videoUrl ? (
          <video
            src={version.videoUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              pointerEvents: "none",
            }}
          />
        ) : isError ? (
          <div className="text-center text-red-300 px-3">
            <p className="text-xs font-medium">Generation failed</p>
          </div>
        ) : version.videoStatus === "rendering" ? (
          <div className="text-center text-zinc-300 px-3">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mx-auto mb-2" />
            <p className="text-xs opacity-60">
              {version.title || "Video composition"}
            </p>
            <p className="text-[10px] mt-1 opacity-40">Rendering...</p>
          </div>
        ) : version.remotionCode ? (
          <div className="text-center text-zinc-300 px-3">
            <div className="text-3xl mb-2">🎬</div>
            <p className="text-xs opacity-60">
              {version.title || "Video composition"}
            </p>
          </div>
        ) : (
          <div className="text-zinc-600 text-xs">No preview</div>
        )}
      </div>
      <PromptLabel prompt={version.prompt} />
    </>
  );
}

function VideoDetailContent({ version }: DetailContentProps) {
  return (
    <div className="flex items-center justify-center bg-zinc-950 min-h-[220px]">
      {version.videoUrl ? (
        <video
          src={version.videoUrl}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="max-w-full max-h-[340px]"
        />
      ) : (
        <div className="text-center text-zinc-400 p-8">
          <div className="text-4xl mb-3">🎬</div>
          <p className="text-sm">{version.title || "Video composition"}</p>
          <p className="text-xs mt-1 opacity-60">Not yet rendered</p>
        </div>
      )}
    </div>
  );
}

function VideoHeaderActions({
  version,
  docWidth,
  docHeight,
}: {
  version: VersionNode;
  docWidth?: number;
  docHeight?: number;
}) {
  if (!version.videoUrl) return null;
  return (
    <button
      className="h-8 px-3 rounded-lg text-xs border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors text-zinc-700 dark:text-zinc-300"
      onClick={() => downloadVideo(version.videoUrl!, version.title)}
    >
      <Download className="h-3.5 w-3.5" />
      MP4
    </button>
  );
}

export const videoRenderer: EntityRenderer = {
  NodeContent: VideoNodeContent,
  DetailContent: VideoDetailContent,
  HeaderActions: VideoHeaderActions,
  hasError: (v) => v.videoStatus === "error" || v.status === "error",
  getDownload: (v) =>
    v.videoUrl ? () => downloadVideo(v.videoUrl!, v.title) : undefined,
};
