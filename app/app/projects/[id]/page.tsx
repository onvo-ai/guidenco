'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChatInterface } from '@/components/chat-interface';
import { HTMLViewer } from '@/components/html-viewer';
import { CodeViewer } from '@/components/code-viewer';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Project } from '@/lib/types';

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [artworkState, setArtworkState] = useState({
    width: 800,
    height: 600,
    versions: [] as Array<{ html: string; timestamp: number; googleFonts?: string[] }>,
    currentVersion: -1,
  });
  const [resetKey, setResetKey] = useState(0);
  const [showCode, setShowCode] = useState(false);

  // Load project by ID
  useEffect(() => {
    if (params.id) {
      loadProject(params.id as string);
      loadArtwork(params.id as string);
    }
  }, [params.id]);

  const loadProject = async (projectId: string) => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const projects = await response.json();
        const project = projects.find((p: Project) => p.id === projectId);
        if (project) {
          setCurrentProject(project);
        } else {
          router.push('/');
        }
      }
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  const loadArtwork = async (projectId: string) => {
    try {
      const response = await fetch(`/api/artwork?projectId=${projectId}`);
      if (response.ok) {
        const artwork = await response.json();
        console.log('Loaded artwork:', artwork);
        setArtworkState({
          width: artwork.width,
          height: artwork.height,
          versions: artwork.versions || [],
          currentVersion: artwork.currentVersion,
        });
      } else if (response.status === 404) {
        console.log('No artwork found yet for project:', projectId);
        // Initialize with default empty state
        setArtworkState({
          width: 800,
          height: 600,
          versions: [],
          currentVersion: -1,
        });
      } else {
        console.error('Failed to load artwork:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading artwork:', error);
    }
  };

  // Reset everything when project changes
  const handleProjectChange = (project: Project) => {
    router.push(`/projects/${project.id}`);
  };

  const handleArtworkUpdate = async () => {
    // Reload artwork from API to get latest version with fonts
    if (params.id) {
      // Add a small delay to ensure database transaction completes
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadArtwork(params.id as string);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      {/* Left Panel: Chat or HTML Code */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full flex flex-col overflow-hidden">
          {/* View Toggle */}
          <div className="flex justify-center h-14 items-center border-b bg-white dark:bg-zinc-950 shrink-0">
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
            {!showCode ? (
              <ChatInterface
                key={resetKey}
                projectId={currentProject.id}
                selectedPageIndex={selectedPageIndex}
                onArtworkUpdate={handleArtworkUpdate}
              />
            ) : (
              <div className="h-full">
                <CodeViewer
                  versions={artworkState.versions}
                  currentVersion={artworkState.currentVersion}
                  selectedPageIndex={selectedPageIndex}
                  onSelectedPageIndexChange={setSelectedPageIndex}
                />
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right Panel: Preview (Always visible) */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full">
          <HTMLViewer
            width={artworkState.width}
            height={artworkState.height}
            versions={artworkState.versions}
            currentVersion={artworkState.currentVersion}
            selectedPageIndex={selectedPageIndex}
            onSelectedPageIndexChange={setSelectedPageIndex}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
