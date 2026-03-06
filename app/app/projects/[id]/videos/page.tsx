'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { SimpleChatInterface } from '@/components/simple-chat-interface';
import { VideoViewer } from '@/components/video-viewer';
import { Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings2 } from 'lucide-react';

interface VideoSettings {
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
}

const PRESETS = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Portrait', width: 1080, height: 1920 },
  { label: 'Story', width: 720, height: 1280 },
];

export default function VideosPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [video, setVideo] = useState<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<VideoSettings>({
    width: 1920,
    height: 1080,
    durationInFrames: 150,
    fps: 30,
  });

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadVideo();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const projects = await res.json();
        const project = projects.find((p: Project) => p.id === projectId);
        if (project) setCurrentProject(project);
        else router.push('/app');
      }
    } catch (e) {
      console.error('Error loading project:', e);
    }
  };

  const loadVideo = async () => {
    try {
      const res = await fetch(`/api/project-video?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setVideo(data);
        setSettings({
          width: data.width ?? 1920,
          height: data.height ?? 1080,
          durationInFrames: data.durationInFrames ?? 150,
          fps: data.fps ?? 30,
        });
      }
    } catch (e) {
      console.error('Error loading video:', e);
    }
  };

  const handleUpdate = useCallback(async () => {
    await loadVideo();
  }, [projectId]);

  const handleSaveSettings = async () => {
    try {
      await fetch('/api/project-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...settings }),
      });
      await loadVideo();
      setShowSettings(false);
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  };

  const handleSaveCode = async (remotionCode: string) => {
    await fetch('/api/project-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, remotionCode }),
    });
    setVideo((v: any) => ({ ...v, remotionCode }));
  };

  const handleRender = async () => {
    if (!video || isRendering) return;
    setIsRendering(true);
    try {
      // Update status to rendering optimistically
      setVideo((v: any) => ({ ...v, status: 'rendering' }));
      const res = await fetch('/api/project-video/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        await loadVideo();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Render failed:', err);
        setVideo((v: any) => ({ ...v, status: 'error' }));
      }
    } catch (e) {
      console.error('Error rendering video:', e);
      setVideo((v: any) => ({ ...v, status: 'error' }));
    } finally {
      setIsRendering(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      {/* Left: Chat */}
      <ResizablePanel defaultSize={40} minSize={25}>
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-zinc-950 shrink-0">
            <div className="inline-flex items-center h-10 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
              <span className="px-4 h-full flex items-center text-sm font-medium rounded-md bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100">
                Chat
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSettings(s => !s)}
              className={`gap-1.5 text-xs ${showSettings ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
            </Button>
          </div>

          {/* Video settings panel */}
          {showSettings && (
            <div className="border-b bg-zinc-50 dark:bg-zinc-900 p-4 space-y-3 shrink-0">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Video Settings</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setSettings(s => ({ ...s, width: p.width, height: p.height }))}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      settings.width === p.width && settings.height === p.height
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent'
                        : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Width (px)</label>
                  <Input
                    type="number"
                    value={settings.width}
                    onChange={e => setSettings(s => ({ ...s, width: Number(e.target.value) }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Height (px)</label>
                  <Input
                    type="number"
                    value={settings.height}
                    onChange={e => setSettings(s => ({ ...s, height: Number(e.target.value) }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Duration (frames)</label>
                  <Input
                    type="number"
                    value={settings.durationInFrames}
                    onChange={e => setSettings(s => ({ ...s, durationInFrames: Number(e.target.value) }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">FPS</label>
                  <Input
                    type="number"
                    value={settings.fps}
                    onChange={e => setSettings(s => ({ ...s, fps: Number(e.target.value) }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-400">
                Duration: {(settings.durationInFrames / settings.fps).toFixed(1)}s at {settings.fps} fps
              </p>
              <Button size="sm" className="w-full" onClick={handleSaveSettings}>
                Save Settings
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <SimpleChatInterface
              projectId={projectId}
              apiEndpoint="/api/video-chat"
              onUpdate={handleUpdate}
              placeholder="Describe the video you want to create..."
              historyEndpoint={`/api/messages?projectId=${projectId}&section=video`}
            />
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: Video Preview */}
      <ResizablePanel defaultSize={60} minSize={30}>
        <div className="h-full">
          <VideoViewer
            video={video}
            onRender={handleRender}
            isRendering={isRendering}
            onSave={handleSaveCode}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
