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
import { EntitySummary } from '@/lib/types';
import { UserMenu } from '@/components/user-menu';

function entityUrl(entity: EntitySummary) {
  if (entity.type === 'asset') return `/app/assets/${entity.id}`;
  if (entity.type === 'video') return `/app/videos/${entity.id}`;
  return `/app/documents/${entity.id}`;
}

interface HeaderProps {
  currentEntity?: EntitySummary | null;
  onEntityChange?: (entity: EntitySummary) => void;
  showProjectSelector?: boolean;
}

export function Header({ currentEntity, onEntityChange, showProjectSelector = true }: HeaderProps) {
  const router = useRouter();
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newEntityName, setNewEntityName] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCreatingEntity, setIsCreatingEntity] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showProjectSelector) {
      loadEntities();
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

  const loadEntities = async () => {
    try {
      const response = await fetch('/api/entities');
      if (response.ok) {
        const data = await response.json();
        setEntities(data);
      }
    } catch (error) {
      console.error('Error loading entities:', error);
    }
  };

  const handleCreateEntity = async () => {
    if (newEntityName.trim() && !isCreatingEntity) {
      setIsCreatingEntity(true);
      try {
        const response = await fetch('/api/entities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newEntityName.trim(), type: 'document' }),
        });
        if (response.ok) {
          const entity = await response.json();
          await loadEntities();
          if (onEntityChange) {
            onEntityChange(entity);
          } else {
            router.push(entityUrl(entity));
          }
          setNewEntityName('');
          setIsCreating(false);
          setDropdownOpen(false);
        }
      } catch (error) {
        console.error('Error creating entity:', error);
        setIsCreatingEntity(false);
      }
    }
  };

  const handleSelectEntity = (entity: EntitySummary) => {
    if (onEntityChange) {
      onEntityChange(entity);
    } else {
      router.push(entityUrl(entity));
    }
    setDropdownOpen(false);
  };

  const handleDeleteEntity = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entities.length > 1) {
      try {
        const response = await fetch(`/api/entities/${id}`, { method: 'DELETE' });
        if (response.ok) {
          await loadEntities();

          if (currentEntity?.id === id) {
            const updatedEntities = entities.filter(e => e.id !== id);
            if (updatedEntities.length > 0 && onEntityChange) {
              onEntityChange(updatedEntities[0]);
            } else {
              router.push('/app');
            }
          }
        }
      } catch (error) {
        console.error('Error deleting entity:', error);
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
          Guidenco
        </h1>

        {showProjectSelector && (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {currentEntity?.name || 'Select Entity'}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 p-0 overflow-hidden shadow-xl border-zinc-200 dark:border-zinc-800">
              <div className="max-h-[70vh] flex flex-col">
                <div className="p-1 overflow-y-auto">
                  {entities.length > 0 ? (
                    entities.map((entity) => (
                      <DropdownMenuItem
                        key={entity.id}
                        onClick={() => handleSelectEntity(entity)}
                        className="flex items-center justify-between group"
                      >
                        <span className="flex-1 truncate mr-2">{entity.name}</span>
                        {entities.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                            onClick={(e) => handleDeleteEntity(entity.id, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-zinc-500 italic text-center">
                      No entities found
                    </div>
                  )}
                </div>

                <DropdownMenuSeparator className="m-0" />

                {isCreating ? (
                  <div className="p-4 space-y-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="space-y-2">
                      <Input
                        ref={inputRef}
                        placeholder="Entity name"
                        value={newEntityName}
                        onChange={(e) => setNewEntityName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateEntity();
                          } else if (e.key === 'Escape') {
                            setIsCreating(false);
                            setNewEntityName('');
                          }
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-white dark:bg-zinc-950"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-9"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateEntity();
                        }}
                        disabled={isCreatingEntity || !newEntityName.trim()}
                      >
                        {isCreatingEntity ? (
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
                        className="flex-1 h-9"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCreating(false);
                          setNewEntityName('');
                        }}
                        disabled={isCreatingEntity}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-1">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        setIsCreating(true);
                      }}
                      onSelect={(e) => e.preventDefault()}
                      className="text-blue-600 dark:text-blue-400 focus:text-blue-600 dark:focus:text-blue-400"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Entity
                    </DropdownMenuItem>
                  </div>
                )}
              </div>
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
