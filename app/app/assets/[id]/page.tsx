'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ChatInterface } from '@/components/chat-interface';
import { AssetViewer } from '@/components/asset-viewer';
import { EntitySummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Settings2 } from 'lucide-react';
import Editor from '@monaco-editor/react';

export default function AssetsPage() {
    const params = useParams();
    const router = useRouter();
    const assetId = params.id as string;

    const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
    const [assetState, setAssetState] = useState({
        versions: [] as Array<{ svgContent: string; title: string; width: number; height: number; timestamp: number }>,
        currentVersion: -1,
    });
    const [showSettings, setShowSettings] = useState(false);
    const [showCode, setShowCode] = useState(false);
    const [editedCode, setEditedCode] = useState('');
    const [settings, setSettings] = useState({ title: 'Untitled Asset', width: 1024, height: 1024 });
    const [isSaving, setIsSaving] = useState(false);

    const currentAssetVersion = assetState.versions[assetState.currentVersion];
    const svgContent = currentAssetVersion?.svgContent ?? '';
    const assetTitle = currentAssetVersion?.title ?? '';

    useEffect(() => {
        setEditedCode(svgContent);
    }, [svgContent]);

    useEffect(() => {
        if (assetId) {
            loadEntity();
            loadAsset();
        }
    }, [assetId]);

    const loadEntity = async () => {
        try {
            const res = await fetch('/api/entities');
            if (res.ok) {
                const entities = await res.json();
                const entity = entities.find((e: EntitySummary) => e.id === assetId);
                if (entity) setCurrentEntity(entity);
                else router.push('/app');
            }
        } catch (e) {
            console.error('Error loading entity:', e);
        }
    };

    const loadAsset = async () => {
        try {
            const res = await fetch(`/api/asset-generations?assetId=${assetId}`);
            if (res.ok) {
                const data = await res.json();
                setAssetState({
                    versions: data.versions || [],
                    currentVersion: data.currentVersion ?? -1,
                });
                setSettings({ title: data.title ?? 'Untitled Asset', width: data.width ?? 1024, height: data.height ?? 1024 });
            }
        } catch (e) {
            console.error('Error loading asset:', e);
        }
    };

    const handleUpdate = useCallback(async () => {
        await loadAsset();
    }, [assetId]);

    const handleVersionChange = useCallback((version: number) => {
        setAssetState((prev) => ({ ...prev, currentVersion: version }));
    }, []);

    const handleSaveAsset = async (newSvgContent: string) => {
        setIsSaving(true);
        try {
            await fetch('/api/asset-generations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId, svgContent: newSvgContent, title: settings.title || assetTitle, width: settings.width, height: settings.height }),
            });
            await loadAsset();
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await fetch('/api/asset-generations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId, title: settings.title, width: settings.width, height: settings.height }),
            });
            await loadAsset();
            setShowSettings(false);
        } catch (error) {
            console.error('Error saving asset settings:', error);
        }
    };

    const hasChanges = editedCode !== svgContent;

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
                            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Asset Settings</p>
                            <div>
                                <label className="text-xs text-zinc-500 mb-1 block">Title</label>
                                <Input
                                    value={settings.title}
                                    onChange={e => setSettings(s => ({ ...s, title: e.target.value }))}
                                    className="h-8 text-sm"
                                />
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
                            </div>
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
                                        defaultLanguage="xml"
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
                                            onClick={() => setEditedCode(svgContent)}
                                        >
                                            Reset
                                        </Button>
                                        <Button size="sm" onClick={() => handleSaveAsset(editedCode)} disabled={isSaving}>
                                            {isSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                                            Save
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <ChatInterface
                                entityId={assetId}
                                entityType="asset"
                                apiEndpoint={`/api/asset-chat?assetId=${encodeURIComponent(assetId)}`}
                                onUpdate={handleUpdate}
                                placeholder="Describe the SVG asset you want to create..."
                                historyEndpoint={`/api/messages?assetId=${assetId}`}
                                emptyStateTitle="Create SVG Assets with AI"
                                emptyStateDescription="Ask me to create, inspect, or refine SVG assets for this asset."
                            />
                        )}
                    </div>
                </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full">
                    <AssetViewer
                        versions={assetState.versions}
                        currentVersion={assetState.currentVersion}
                        onVersionChange={handleVersionChange}
                    />
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
