'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ChevronDown, Plus, Trash2, Loader2 } from 'lucide-react';
import { Project } from '@/lib/types';
import { UserMenu } from '@/components/user-menu';

interface HeaderProps {
  currentProject?: Project | null;
  onProjectChange?: (project: Project) => void;
  showProjectSelector?: boolean;
}

export function Header({ currentProject, onProjectChange, showProjectSelector = true }: HeaderProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showProjectSelector) {
      loadProjects();
    }
  }, [showProjectSelector]);

  // Focus input when isCreating becomes true
  useEffect(() => {
    if (isCreating && inputRef.current) {
      // Use setTimeout to ensure the input is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isCreating]);

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleCreateProject = async () => {
    if (newProjectName.trim() && !isCreatingProject) {
      setIsCreatingProject(true);
      try {
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newProjectName.trim() }),
        });
        if (response.ok) {
          const project = await response.json();
          await loadProjects();
          if (onProjectChange) {
            onProjectChange(project);
          } else {
            router.push(`/app/projects/${project.id}`);
          }
          setNewProjectName('');
          setIsCreating(false);
          setDropdownOpen(false);
        }
      } catch (error) {
        console.error('Error creating project:', error);
        setIsCreatingProject(false);
      }
    }
  };

  const handleSelectProject = (project: Project) => {
    if (onProjectChange) {
      onProjectChange(project);
    } else {
      router.push(`/app/projects/${project.id}`);
    }
    setDropdownOpen(false);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (projects.length > 1) {
      try {
        const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        if (response.ok) {
          // Reload projects list
          await loadProjects();
          
          // If we deleted the current project, navigate to another one or dashboard
          if (currentProject?.id === id) {
            const updatedProjects = projects.filter(p => p.id !== id);
            if (updatedProjects.length > 0 && onProjectChange) {
              onProjectChange(updatedProjects[0]);
            } else {
              router.push('/app');
            }
          }
        }
      } catch (error) {
        console.error('Error deleting project:', error);
      }
    }
  };

  return (
    <header className="border-b bg-white dark:bg-zinc-950">
      <div className="flex h-14 items-center px-4 gap-4">
        <h1 
          className="text-lg font-semibold cursor-pointer hover:text-blue-600 transition-colors"
          onClick={() => router.push('/app')}
        >
          Artiste
        </h1>
        
        {showProjectSelector && (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              {currentProject?.name || 'Select Project'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleSelectProject(project)}
                className="flex items-center justify-between"
              >
                <span className="flex-1">{project.name}</span>
                {projects.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => handleDeleteProject(project.id, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {isCreating ? (
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="p-2 space-y-2 focus:bg-transparent"
              >
                <div className="space-y-2">
                  <Input
                    ref={inputRef}
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateProject();
                      } else if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewProjectName('');
                      }
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateProject();
                      }}
                      disabled={isCreatingProject || !newProjectName.trim()}
                    >
                      {isCreatingProject ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCreating(false);
                        setNewProjectName('');
                      }}
                      disabled={isCreatingProject}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem 
                onClick={(e) => {
                  e.preventDefault();
                  setIsCreating(true);
                }}
                onSelect={(e) => e.preventDefault()}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        )}
        
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
