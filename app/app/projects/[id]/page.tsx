'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChatInterface } from '@/components/chat-interface';
import { HTMLViewer } from '@/components/html-viewer';
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
        setArtworkState({
          width: artwork.width,
          height: artwork.height,
          versions: artwork.versions || [],
          currentVersion: artwork.currentVersion,
        });
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
      {/* Chat Panel */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <ChatInterface
          key={resetKey}
          projectId={currentProject.id}
          selectedPageIndex={selectedPageIndex}
          onArtworkUpdate={handleArtworkUpdate}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Artwork Panel */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full p-4">
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
