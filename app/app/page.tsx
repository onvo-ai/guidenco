'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Trash2, FileText, History, LayoutTemplate, Shapes, Film } from 'lucide-react';
import { Project } from '@/lib/types';
import { NewProjectModal } from '@/components/new-project-modal';

function projectUrl(project: Project) {
  if (project.type === 'asset') return `/app/projects/${project.id}/assets`;
  if (project.type === 'video') return `/app/projects/${project.id}/videos`;
  return `/app/projects/${project.id}`;
}

const TYPE_META = {
  artwork: { label: 'Artwork', Icon: LayoutTemplate },
  asset: { label: 'Asset', Icon: Shapes },
  video: { label: 'Video', Icon: Film },
} as const;

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectCreated = (projectId: string, type: 'artwork' | 'asset' | 'video') => {
    if (type === 'asset') router.push(`/app/projects/${projectId}/assets`);
    else if (type === 'video') router.push(`/app/projects/${projectId}/videos`);
    else router.push(`/app/projects/${projectId}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setProjectToDelete(projectId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setDeletingProjectId(projectToDelete);
    try {
      const response = await fetch(`/api/projects/${projectToDelete}`, { method: 'DELETE' });
      if (response.ok) {
        setProjects(projects.filter((p) => p.id !== projectToDelete));
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    } finally {
      setDeletingProjectId(null);
      setShowDeleteConfirm(false);
      setProjectToDelete(null);
    }
  };

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-zinc-950 overflow-auto">
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Projects</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Create and manage your design projects
            </p>
          </div>
          <Button onClick={() => setShowModal(true)} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            New Project
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
              <Plus className="h-8 w-8 text-zinc-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Create your first project to get started
            </p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => {
              const meta = TYPE_META[project.type] ?? TYPE_META.artwork;
              return (
                <div
                  key={project.id}
                  onClick={() => router.push(projectUrl(project))}
                  className="group relative cursor-pointer bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-md mb-2 flex items-center justify-center overflow-hidden">
                    {(project as any).thumbnail ? (
                      <img
                        src={(project as any).thumbnail}
                        alt={project.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-zinc-400 text-sm">No preview</div>
                    )}
                  </div>
                  <div className="flex items-start justify-between mt-2">
                    <h3 className="text-md font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {project.name}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full ml-2 shrink-0">
                      <meta.Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                  {((project as any).pageCount > 0 || (project as any).versionCount > 0) && (
                    <div className="flex items-center gap-2">
                      {(project as any).pageCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          <FileText className="h-3 w-3" />
                          {(project as any).pageCount}{' '}
                          {(project as any).pageCount === 1 ? 'page' : 'pages'}
                        </span>
                      )}
                      {(project as any).versionCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          <History className="h-3 w-3" />
                          {(project as any).versionCount}{' '}
                          {(project as any).versionCount === 1 ? 'version' : 'versions'}
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={(e) => handleDeleteClick(e, project.id)}
                    disabled={deletingProjectId === project.id}
                    className="absolute top-2 right-2 p-2 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    aria-label="Delete project"
                  >
                    {deletingProjectId === project.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <NewProjectModal
        open={showModal}
        onOpenChange={setShowModal}
        onCreated={handleProjectCreated}
      />

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => { setShowDeleteConfirm(false); setProjectToDelete(null); }}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Delete Project</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setProjectToDelete(null); }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
