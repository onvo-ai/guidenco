'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChatInterface } from '@/components/chat-interface';
import { HTMLViewer } from '@/components/html-viewer';
import { CodeViewer } from '@/components/code-viewer';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntitySummary } from '@/lib/types';
import type { SelectedElement } from '@/components/element-selector-overlay';
import { Settings2, Eye, MessageSquare } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-is-mobile';

export default function DocumentPage() {
    const router = useRouter();
    const params = useParams();
    const documentId = params.id as string;
    const isMobile = useIsMobile();

    const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
    const [selectedPageIndex, setSelectedPageIndex] = useState(0);
    const [documentState, setDocumentState] = useState({
        width: 800,
        height: 600,
        versions: [] as Array<{ html: string; timestamp: number; googleFonts?: string[] }>,
        currentVersion: -1,
    });
    const [resetKey, setResetKey] = useState(0);
    const [showCode, setShowCode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({ title: 'Untitled Document', width: 800, height: 600 });
    const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
    const [pendingElementPrompt, setPendingElementPrompt] = useState<{
        prompt: string;
        element: SelectedElement;
    } | null>(null);

    const loadEntity = async (entityId: string) => {
        try {
            const response = await fetch('/api/entities');
            if (response.ok) {
                const entities = await response.json();
                const entity = entities.find((e: EntitySummary) => e.id === entityId);
                if (entity) {
                    setCurrentEntity(entity);
                } else {
                    router.push('/');
                }
            }
        } catch (error) {
            console.error('Error loading entity:', error);
        }
    };

    const loadDocument = async (documentId: string) => {
        try {
            const response = await fetch(`/api/documents?documentId=${documentId}`);
            if (response.ok) {
                const document = await response.json();
                console.log('Loaded document:', document);
                setDocumentState({
                    width: document.width,
                    height: document.height,
                    versions: document.versions || [],
                    currentVersion: document.currentVersion,
                });
                setSettings({ title: document.title ?? 'Untitled Document', width: document.width, height: document.height });
            } else if (response.status === 404) {
                console.log('No document found yet for document:', documentId);
                setDocumentState({
                    width: 800,
                    height: 600,
                    versions: [],
                    currentVersion: -1,
                });
                setSettings({ title: 'Untitled Document', width: 800, height: 600 });
            } else {
                console.error('Failed to load document:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Error loading document:', error);
        }
    };

    useEffect(() => {
        if (documentId) {
            loadEntity(documentId);
            loadDocument(documentId);
        }
    }, [documentId]);

    const handleElementPrompt = useCallback((prompt: string, element: SelectedElement) => {
        setShowCode(false);
        setMobileTab('editor');
        setPendingElementPrompt({ prompt, element });
    }, []);

    const handleDocumentUpdate = async () => {
        if (documentId) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadDocument(documentId);
        }
    };

    const handleSaveSettings = async () => {
        if (!currentEntity) return;
        try {
            await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId: currentEntity.id, title: settings.title, width: settings.width, height: settings.height }),
            });
            setDocumentState((prev) => ({ ...prev, width: settings.width, height: settings.height }));
            setShowSettings(false);
        } catch (error) {
            console.error('Error saving document settings:', error);
        }
    };

    if (!currentEntity) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    const settingsPanel = showSettings && (
        <div className="border-b bg-zinc-50 dark:bg-zinc-900 p-4 space-y-3 shrink-0">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Document Settings</p>
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
    );

    const editorTabToggle = (
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
    );

    const settingsButton = (
        <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(s => !s)}
            className={`gap-1.5 text-xs ${showSettings ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
        >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
        </Button>
    );

    const editorContent = !showCode ? (
        <ChatInterface
            key={resetKey}
            entityId={currentEntity.id}
            entityType="document"
            selectedPageIndex={selectedPageIndex}
            onDocumentUpdate={handleDocumentUpdate}
            pendingElementPrompt={pendingElementPrompt}
            onElementPromptSent={() => setPendingElementPrompt(null)}
            documentHtml={documentState.versions[documentState.currentVersion]?.html ?? ''}
        />
    ) : (
        <div className="h-full">
            <CodeViewer
                versions={documentState.versions}
                currentVersion={documentState.currentVersion}
                selectedPageIndex={selectedPageIndex}
                onSelectedPageIndexChange={setSelectedPageIndex}
            />
        </div>
    );

    const previewContent = (
        <HTMLViewer
            width={documentState.width}
            height={documentState.height}
            versions={documentState.versions}
            currentVersion={documentState.currentVersion}
            selectedPageIndex={selectedPageIndex}
            onSelectedPageIndexChange={setSelectedPageIndex}
            onElementPrompt={handleElementPrompt}
        />
    );

    if (isMobile) {
        return (
            <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 shrink-0 gap-2">
                    {editorTabToggle}
                    <div className="ml-auto flex items-center gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setMobileTab(t => t === 'preview' ? 'editor' : 'preview')}
                            className="gap-1.5 text-xs"
                        >
                            {mobileTab === 'editor' ? <Eye className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                            {mobileTab === 'editor' ? 'Preview' : 'Editor'}
                        </Button>
                        {settingsButton}
                    </div>
                </div>
                {settingsPanel}
                <div className="flex-1 overflow-hidden">
                    {mobileTab === 'editor' ? editorContent : previewContent}
                </div>
            </div>
        );
    }

    return (
        <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-zinc-950 shrink-0">
                        {editorTabToggle}
                        {settingsButton}
                    </div>
                    {settingsPanel}
                    <div className="flex-1 overflow-hidden">
                        {editorContent}
                    </div>
                </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full">
                    {previewContent}
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
