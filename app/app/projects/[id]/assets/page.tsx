'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { SimpleChatInterface } from '@/components/simple-chat-interface';
import { AssetViewer } from '@/components/asset-viewer';
import { Project } from '@/lib/types';

export default function AssetsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [svgContent, setSvgContent] = useState('');
  const [assetTitle, setAssetTitle] = useState('');

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
    await fetch('/api/project-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, svgContent: newSvgContent, title: assetTitle }),
    });
    setSvgContent(newSvgContent);
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
          <div className="flex items-center justify-center h-14 border-b bg-white dark:bg-zinc-950 shrink-0">
            <div className="inline-flex items-center h-10 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
              <span className="px-4 h-full flex items-center text-sm font-medium rounded-md bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100">
                Chat
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <SimpleChatInterface
              projectId={projectId}
              apiEndpoint="/api/asset-chat"
              onUpdate={handleUpdate}
              placeholder="Describe the SVG asset you want to create..."
              historyEndpoint={`/api/messages?projectId=${projectId}&section=asset`}
            />
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: SVG Preview */}
      <ResizablePanel defaultSize={60} minSize={30}>
        <div className="h-full">
          <AssetViewer svgContent={svgContent} title={assetTitle} onSave={handleSaveAsset} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
