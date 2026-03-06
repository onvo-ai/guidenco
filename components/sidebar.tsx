'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  LayoutTemplate,
  Shapes,
  Film,
  Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Project } from '@/lib/types';
import { SettingsModal } from '@/components/settings-modal';

interface SidebarProps {
  currentProject?: Project | null;
  onProjectChange?: (project: Project) => void;
}

const NAV_ITEMS = [
  { label: 'Artworks', icon: LayoutTemplate, href: (id: string) => `/app/projects/${id}` },
  { label: 'Assets', icon: Shapes, href: (id: string) => `/app/projects/${id}/assets` },
  { label: 'Videos', icon: Film, href: (id: string) => `/app/projects/${id}/videos` },
];

export function Sidebar({ currentProject, onProjectChange }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = session?.user?.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

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

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        await loadProjects();
        onProjectChange ? onProjectChange(project) : router.push(`/app/projects/${project.id}`);
        setNewProjectName('');
        setIsCreating(false);
        setDropdownOpen(false);
      }
    } catch (e) {
      console.error('Error creating project:', e);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleSelectProject = (project: Project) => {
    onProjectChange ? onProjectChange(project) : router.push(`/app/projects/${project.id}`);
    setDropdownOpen(false);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (projects.length <= 1) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadProjects();
        if (currentProject?.id === id) {
          const remaining = projects.filter(p => p.id !== id);
          if (remaining.length > 0 && onProjectChange) {
            onProjectChange(remaining[0]);
          } else {
            router.push('/app');
          }
        }
      }
    } catch (e) {
      console.error('Error deleting project:', e);
    }
  };

  const getActiveSection = () => {
    if (!currentProject) return null;
    if (pathname?.endsWith('/assets')) return 'Assets';
    if (pathname?.endsWith('/videos')) return 'Videos';
    return 'Artworks';
  };

  const activeSection = getActiveSection();

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen border-r bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
      {/* Brand + Project Selector */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => router.push('/app')}
          className="flex items-center gap-2 mb-3 group"
        >
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            Guidenco
          </span>
        </button>

        {currentProject ? (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <span className="truncate">{currentProject.name}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 p-0 shadow-xl border-zinc-200 dark:border-zinc-800">
              <div className="max-h-[60vh] flex flex-col">
                <div className="p-1 overflow-y-auto">
                  {projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleSelectProject(p)}
                      className="flex items-center justify-between group"
                    >
                      <span className="flex-1 truncate mr-2 text-sm">{p.name}</span>
                      {projects.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleDeleteProject(p.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator className="m-0" />
                {isCreating ? (
                  <div className="p-3 space-y-2">
                    <Input
                      ref={inputRef}
                      placeholder="Project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateProject();
                        else if (e.key === 'Escape') { setIsCreating(false); setNewProjectName(''); }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreateProject} disabled={isCreatingProject || !newProjectName.trim()}>
                        {isCreatingProject ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => { setIsCreating(false); setNewProjectName(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-1">
                    <DropdownMenuItem
                      onClick={(e) => { e.preventDefault(); setIsCreating(true); }}
                      onSelect={(e) => e.preventDefault()}
                      className="text-blue-600 dark:text-blue-400 text-sm"
                    >
                      <Plus className="h-3.5 w-3.5 mr-2" />
                      New Project
                    </DropdownMenuItem>
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={() => router.push('/app')}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Home className="h-4 w-4" />
            <span>All Projects</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5">
        {currentProject ? (
          NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const isActive = activeSection === label;
            return (
              <button
                key={label}
                onClick={() => router.push(href(currentProject.id))}
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
          })
        ) : (
          <button
            onClick={() => router.push('/app')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          >
            <Home className="h-4 w-4 shrink-0" />
            Projects
          </button>
        )}
      </nav>

      {/* User */}
      {session?.user && (
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full border-t border-zinc-200 dark:border-zinc-800 p-3 flex items-center gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left"
        >
          {/* Avatar */}
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
