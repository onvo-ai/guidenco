'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { SimpleChatInterface } from '@/components/simple-chat-interface';
import { AssetViewer } from '@/components/asset-viewer';
import { Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function AssetsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [svgContent, setSvgContent] = useState('');
  const [assetTitle, setAssetTitle] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [editedCode, setEditedCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync editedCode when svgContent changes (e.g. LLM generates new SVG)
  useEffect(() => {
    setEditedCode(svgContent);
  }, [svgContent]);

  useEffect(() => {
    if (projectId) {
      loadProject();
      loadAsset();
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

  const loadAsset = async () => {
    try {
      const res = await fetch(`/api/project-asset?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSvgContent(data.svgContent || '');
        setAssetTitle(data.title || '');
      }
    } catch (e) {
      console.error('Error loading asset:', e);
    }
  };

  const handleUpdate = useCallback(async () => {
    await loadAsset();
  }, [projectId]);

  const handleSaveAsset = async (newSvgContent: string) => {
    setIsSaving(true);
    try {
      await fetch('/api/project-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, svgContent: newSvgContent, title: assetTitle }),
      });
      setSvgContent(newSvgContent);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = editedCode !== svgContent;

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      {/* Left: Chat or Code */}
      <ResizablePanel defaultSize={40} minSize={25}>
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-center h-14 border-b bg-white dark:bg-zinc-950 shrink-0">
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
          </div>

          <div className="flex-1 overflow-hidden">
            {showCode ? (
              <div className="h-full flex flex-col bg-zinc-900">
                <textarea
                  value={editedCode}
                  onChange={(e) => setEditedCode(e.target.value)}
                  className="flex-1 w-full p-4 text-xs text-zinc-100 font-mono bg-transparent resize-none outline-none leading-relaxed"
                  spellCheck={false}
                />
                {hasChanges && (
                  <div className="p-3 border-t border-zinc-800 flex justify-end gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditedCode(svgContent)}
                      className="text-zinc-400 hover:text-zinc-200"
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
              <SimpleChatInterface
                projectId={projectId}
                apiEndpoint="/api/asset-chat"
                onUpdate={handleUpdate}
                placeholder="Describe the SVG asset you want to create..."
                historyEndpoint={`/api/messages?projectId=${projectId}&section=asset`}
              />
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: SVG Preview (always visible) */}
      <ResizablePanel defaultSize={60} minSize={30}>
        <div className="h-full">
          <AssetViewer svgContent={svgContent} title={assetTitle} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
