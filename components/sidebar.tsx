'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import {
  Plus,
  Loader2,
  LayoutTemplate,
  Shapes,
  Film,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import { Project } from '@/lib/types';
import { SettingsModal } from '@/components/settings-modal';

type SectionType = 'artwork' | 'asset' | 'video';

const SECTIONS: { type: SectionType; label: string; icon: React.ElementType }[] = [
  { type: 'artwork', label: 'Artworks', icon: LayoutTemplate },
  { type: 'asset', label: 'Assets', icon: Shapes },
  { type: 'video', label: 'Videos', icon: Film },
];

function projectUrl(project: Project) {
  if (project.type === 'asset') return `/app/projects/${project.id}/assets`;
  if (project.type === 'video') return `/app/projects/${project.id}/videos`;
  return `/app/projects/${project.id}`;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { data: session } = useSession();

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeSection, setActiveSection] = useState<SectionType>('artwork');
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentProjectId = params?.id as string | undefined;

  // Derive active section from current URL
  useEffect(() => {
    if (pathname?.endsWith('/assets')) {
      setActiveSection('asset');
    } else if (pathname?.endsWith('/videos')) {
      setActiveSection('video');
    } else if (pathname?.includes('/projects/')) {
      setActiveSection('artwork');
    }
  }, [pathname]);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isCreating]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) setProjects(await res.json());
    } catch (e) {
      console.error('Error loading projects:', e);
    }
  };

  const filteredProjects = projects.filter((p) => p.type === activeSection);

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), type: activeSection }),
      });
      if (res.ok) {
        const project = await res.json();
        await loadProjects();
        router.push(projectUrl({ ...project, type: activeSection }));
        setNewProjectName('');
        setIsCreating(false);
      }
    } catch (e) {
      console.error('Error creating project:', e);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (filteredProjects.length <= 1) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadProjects();
        if (currentProjectId === id) {
          const remaining = filteredProjects.filter((p) => p.id !== id);
          if (remaining.length > 0) {
            router.push(projectUrl(remaining[0]));
          } else {
            router.push('/app');
          }
        }
      }
    } catch (e) {
      console.error('Error deleting project:', e);
    }
  };

  const initials =
    session?.user?.name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  const sectionLabel = SECTIONS.find((s) => s.type === activeSection)?.label ?? 'Project';

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen border-r bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
      {/* Brand */}
      <div className="px-4 h-14 flex items-center border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={() => router.push('/app')}
          className="text-lg font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          Guidenco
        </button>
      </div>

      {/* Section tabs */}
      <nav className="p-2 border-b border-zinc-200 dark:border-zinc-800 space-y-0.5 shrink-0">
        {SECTIONS.map(({ type, label, icon: Icon }) => {
          const isActive = activeSection === type;
          return (
            <button
              key={type}
              onClick={() => setActiveSection(type)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {filteredProjects.map((project) => {
          const isActive = project.id === currentProjectId;
          return (
            <button
              key={project.id}
              onClick={() => router.push(projectUrl(project))}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors group ${
                isActive
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <span className="truncate text-left">{project.name}</span>
              {filteredProjects.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => handleDeleteProject(project.id, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </button>
          );
        })}

        {/* New project input / button */}
        {isCreating ? (
          <div className="p-2 space-y-2">
            <Input
              ref={inputRef}
              placeholder={`${sectionLabel.slice(0, -1)} name`}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewProjectName('');
                }
                e.stopPropagation();
              }}
              className="text-sm h-8"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleCreateProject}
                disabled={isCreatingProject || !newProjectName.trim()}
              >
                {isCreatingProject ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={() => {
                  setIsCreating(false);
                  setNewProjectName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            New {sectionLabel.slice(0, -1)}
          </button>
        )}
      </div>

      {/* User */}
      {session?.user && (
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full border-t border-zinc-200 dark:border-zinc-800 p-3 flex items-center gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left"
        >
          <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-primary text-primary-foreground text-sm font-medium border border-zinc-200 dark:border-zinc-700">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate leading-tight">
              {session.user.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate leading-tight">
              {session.user.email}
            </p>
          </div>
        </button>
      )}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
