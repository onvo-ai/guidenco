'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { VideoViewer } from '@/components/video-viewer';
import { EntitySummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings2, Loader2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { ChatInterface } from '@/components/chat-interface';

interface VideoSettings {
    title: string;
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
    const videoId = params.id as string;

    const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
    const [videoState, setVideoState] = useState<{
        video: any;
        currentVersion: number;
    }>({
        video: null,
        currentVersion: -1,
    });
    const [isRendering, setIsRendering] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showCode, setShowCode] = useState(false);
    const [editedCode, setEditedCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<VideoSettings>({
        title: 'Untitled Video',
        width: 1920,
        height: 1080,
        durationInFrames: 150,
        fps: 30,
    });

    const video = videoState.video;
    const currentVideoVersion = video?.versions?.[videoState.currentVersion];
    const currentRemotionCode = currentVideoVersion?.remotionCode ?? video?.remotionCode ?? '';
    const currentVersionTimestamp = currentVideoVersion?.timestamp ?? video?.updatedAt ?? video?.createdAt ?? 'base';
    const [autoRenderKey, setAutoRenderKey] = useState<string | null>(null);

    useEffect(() => {
        setEditedCode(currentRemotionCode);
    }, [currentRemotionCode]);

    useEffect(() => {
        if (videoId) {
            loadEntity();
            loadVideo();
        }
    }, [videoId]);

    const loadEntity = async () => {
        try {
            const res = await fetch('/api/entities');
            if (res.ok) {
                const entities = await res.json();
                const entity = entities.find((e: EntitySummary) => e.id === videoId);
                if (entity) setCurrentEntity(entity);
                else router.push('/app');
            }
        } catch (e) {
            console.error('Error loading entity:', e);
        }
    };

    const loadVideo = async () => {
        try {
            const res = await fetch(`/api/videos?videoId=${videoId}`);
            if (res.ok) {
                const data = await res.json();
                setVideoState({
                    video: data,
                    currentVersion: data.currentVersion ?? (data.versions?.length ? data.versions.length - 1 : -1),
                });
                setSettings({
                    title: data.title ?? 'Untitled Video',
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
    }, [videoId]);

    const handleVersionChange = useCallback((version: number) => {
        setVideoState((prev) => ({ ...prev, currentVersion: version }));
    }, []);

    const handleSaveSettings = async () => {
        try {
            await fetch('/api/videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId, ...settings }),
            });
            await loadVideo();
            setShowSettings(false);
        } catch (e) {
            console.error('Error saving settings:', e);
        }
    };

    const handleSaveCode = async (remotionCode: string) => {
        setIsSaving(true);
        try {
            await fetch('/api/videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId, remotionCode }),
            });
            await loadVideo();
        } finally {
            setIsSaving(false);
        }
    };

    const handleRender = async () => {
        if (!video || isRendering) return;
        setIsRendering(true);
        try {
            setVideoState((prev) => ({
                ...prev,
                video: prev.video ? { ...prev.video, status: 'rendering' } : prev.video,
            }));
            const res = await fetch('/api/videos/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId }),
            });
            if (res.ok) {
                await loadVideo();
            } else {
                const err = await res.json().catch(() => ({}));
                console.error('Render failed:', err);
                setVideoState((prev) => ({
                    ...prev,
                    video: prev.video ? { ...prev.video, status: 'error' } : prev.video,
                }));
            }
        } catch (e) {
            console.error('Error rendering video:', e);
            setVideoState((prev) => ({
                ...prev,
                video: prev.video ? { ...prev.video, status: 'error' } : prev.video,
            }));
        } finally {
            setIsRendering(false);
        }
    };

    useEffect(() => {
        if (!video || video.status !== 'rendering') return;

        const poll = window.setInterval(() => {
            void loadVideo();
        }, 3000);

        return () => window.clearInterval(poll);
    }, [video?.id, video?.status]);

    useEffect(() => {
        if (!video || !currentRemotionCode || video.status !== 'pending' || isRendering) return;

        const nextAutoRenderKey = `${video.id}:${videoState.currentVersion}:${currentVersionTimestamp}`;
        if (autoRenderKey === nextAutoRenderKey) return;

        setAutoRenderKey(nextAutoRenderKey);
        void handleRender();
    }, [
        video?.id,
        video?.status,
        currentRemotionCode,
        currentVersionTimestamp,
        videoState.currentVersion,
        isRendering,
        autoRenderKey,
    ]);

    const hasChanges = editedCode !== currentRemotionCode;

    if (!currentEntity) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
        );
    }

    return (
        <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={40} minSize={25}>
                <div className="h-full flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-zinc-950 shrink-0">
                        <div className="inline-flex items-center h-10 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
                            <button
                                onClick={() => setShowCode(false)}
                                className={`px-4 h-full text-sm font-medium rounded-md transition-all ${!showCode
                                    ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                            >
                                Chat
                            </button>
                            <button
                                onClick={() => setShowCode(true)}
                                className={`px-4 h-full text-sm font-medium rounded-md transition-all ${showCode
                                    ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                            >
                                Code
                            </button>
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

                    {showSettings && (
                        <div className="border-b bg-zinc-50 dark:bg-zinc-900 p-4 space-y-3 shrink-0">
                            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Video Settings</p>
                            <div>
                                <label className="text-xs text-zinc-500 mb-1 block">Title</label>
                                <Input
                                    value={settings.title}
                                    onChange={e => setSettings(s => ({ ...s, title: e.target.value }))}
                                    className="h-8 text-sm"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {PRESETS.map(p => (
                                    <button
                                        key={p.label}
                                        onClick={() => setSettings(s => ({ ...s, width: p.width, height: p.height }))}
                                        className={`text-xs px-2 py-1 rounded border transition-colors ${settings.width === p.width && settings.height === p.height
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
                        {showCode ? (
                            <div className="h-full flex flex-col">
                                <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
                                    <Editor
                                        height="100%"
                                        language="typescript"
                                        path="MainComposition.tsx"
                                        theme="vs-dark"
                                        value={editedCode || ''}
                                        onChange={(val) => setEditedCode(val ?? '')}
                                        options={{
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
                                {hasChanges && (
                                    <div className="p-3 border-t bg-white dark:bg-zinc-950 flex justify-end gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setEditedCode(currentRemotionCode)}
                                        >
                                            Reset
                                        </Button>
                                        <Button size="sm" onClick={() => handleSaveCode(editedCode)} disabled={isSaving}>
                                            {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                                            Save
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <ChatInterface
                                entityId={videoId}
                                entityType="video"
                                apiEndpoint={`/api/video-chat?videoId=${encodeURIComponent(videoId)}`}
                                onUpdate={handleUpdate}
                                placeholder="Describe the video you want to create..."
                                historyEndpoint={`/api/messages?videoId=${videoId}`}
                                emptyStateTitle="Create Videos with AI"
                                emptyStateDescription="Ask me to create, inspect, and refine Remotion video compositions."
                            />
                        )}
                    </div>
                </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full">
                    <VideoViewer
                        video={video}
                        onVersionChange={handleVersionChange}
                    />
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
