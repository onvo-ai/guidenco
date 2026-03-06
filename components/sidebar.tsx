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
  ChevronRight,
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

function activeSectionFromPath(pathname: string | null): SectionType | null {
  if (pathname?.endsWith('/assets')) return 'asset';
  if (pathname?.endsWith('/videos')) return 'video';
  if (pathname?.includes('/projects/')) return 'artwork';
  return null;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { data: session } = useSession();

  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<Set<SectionType>>(new Set(['artwork']));
  // creatingIn tracks which section has the inline create input open
  const [creatingIn, setCreatingIn] = useState<SectionType | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentProjectId = params?.id as string | undefined;

  // Auto-expand the section matching the current URL
  useEffect(() => {
    const section = activeSectionFromPath(pathname);
    if (section) {
      setExpanded((prev) => {
        if (prev.has(section)) return prev;
        return new Set([...prev, section]);
      });
    }
  }, [pathname]);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (creatingIn && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [creatingIn]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) setProjects(await res.json());
    } catch (e) {
      console.error('Error loading projects:', e);
    }
  };

  const toggleSection = (type: SectionType) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        // close create input if open in this section
        if (creatingIn === type) {
          setCreatingIn(null);
          setNewProjectName('');
        }
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleCreateProject = async (type: SectionType) => {
    if (!newProjectName.trim() || isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), type }),
      });
      if (res.ok) {
        const project = await res.json();
        await loadProjects();
        router.push(projectUrl({ ...project, type }));
        setNewProjectName('');
        setCreatingIn(null);
      }
    } catch (e) {
      console.error('Error creating project:', e);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async (
    project: Project,
    sectionProjects: Project[],
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (sectionProjects.length <= 1) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadProjects();
        if (currentProjectId === project.id) {
          const remaining = sectionProjects.filter((p) => p.id !== project.id);
          router.push(remaining.length > 0 ? projectUrl(remaining[0]) : '/app');
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

  const currentSection = activeSectionFromPath(pathname);

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

      {/* Collapsible sections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {SECTIONS.map(({ type, label, icon: Icon }) => {
          const isExpanded = expanded.has(type);
          const isActiveSection = currentSection === type;
          const sectionProjects = projects.filter((p) => p.type === type);
          const isCreatingHere = creatingIn === type;
          const singularLabel = label.slice(0, -1); // 'Artworks' → 'Artwork'

          return (
            <div key={type}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(type)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActiveSection
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                }`}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {sectionProjects.length > 0 && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {sectionProjects.length}
                  </span>
                )}
              </button>

              {/* Section content */}
              {isExpanded && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-zinc-100 dark:border-zinc-800 pl-2">
                  {sectionProjects.map((project) => {
                    const isActive = project.id === currentProjectId;
                    return (
                      <button
                        key={project.id}
                        onClick={() => router.push(projectUrl(project))}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group ${
                          isActive
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                        }`}
                      >
                        <span className="truncate text-left">{project.name}</span>
                        {sectionProjects.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => handleDeleteProject(project, sectionProjects, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </button>
                    );
                  })}

                  {/* Inline create */}
                  {isCreatingHere ? (
                    <div className="py-1 space-y-1.5">
                      <Input
                        ref={inputRef}
                        placeholder={`${singularLabel} name`}
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProject(type);
                          else if (e.key === 'Escape') {
                            setCreatingIn(null);
                            setNewProjectName('');
                          }
                          e.stopPropagation();
                        }}
                        className="text-xs h-7"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="flex-1 h-6 text-xs"
                          onClick={() => handleCreateProject(type)}
                          disabled={isCreatingProject || !newProjectName.trim()}
                        >
                          {isCreatingProject ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Create'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-6 text-xs"
                          onClick={() => {
                            setCreatingIn(null);
                            setNewProjectName('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCreatingIn(type);
                        setNewProjectName('');
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      New {singularLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
