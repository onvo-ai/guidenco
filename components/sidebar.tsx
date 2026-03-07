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
import { EntitySummary } from '@/lib/types';
import { SettingsModal } from '@/components/settings-modal';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

type SectionType = 'document' | 'asset' | 'video';

const SECTIONS: { type: SectionType; label: string; icon: React.ElementType }[] = [
  { type: 'asset', label: 'Assets', icon: Shapes },
  { type: 'document', label: 'Documents', icon: LayoutTemplate },
  { type: 'video', label: 'Videos', icon: Film },
];

function entityUrl(entity: EntitySummary) {
  if (entity.type === 'asset') return `/app/assets/${entity.id}`;
  if (entity.type === 'video') return `/app/videos/${entity.id}`;
  return `/app/documents/${entity.id}`;
}

function activeSectionFromPath(pathname: string | null): SectionType | null {
  if (pathname?.includes('/assets/')) return 'asset';
  if (pathname?.includes('/videos/')) return 'video';
  if (pathname?.includes('/documents/')) return 'document';
  return null;
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { data: session } = useSession();

  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [expanded, setExpanded] = useState<Set<SectionType>>(new Set(['document']));
  const [creatingIn, setCreatingIn] = useState<SectionType | null>(null);
  const [newEntityName, setNewEntityName] = useState('');
  const [isCreatingEntity, setIsCreatingEntity] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentEntityId = params?.id as string | undefined;

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
    loadEntities();
  }, []);

  useEffect(() => {
    if (creatingIn && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [creatingIn]);

  const loadEntities = async () => {
    try {
      const res = await fetch('/api/entities');
      if (res.ok) setEntities(await res.json());
    } catch (e) {
      console.error('Error loading entities:', e);
    }
  };

  const toggleSection = (type: SectionType) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        if (creatingIn === type) {
          setCreatingIn(null);
          setNewEntityName('');
        }
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const navigate = (url: string) => {
    router.push(url);
    onClose?.();
  };

  const handleCreateEntity = async (type: SectionType) => {
    if (!newEntityName.trim() || isCreatingEntity) return;
    setIsCreatingEntity(true);
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEntityName.trim(), type }),
      });
      if (res.ok) {
        const entity = await res.json();
        await loadEntities();
        navigate(entityUrl(entity));
        setNewEntityName('');
        setCreatingIn(null);
      }
    } catch (e) {
      console.error('Error creating entity:', e);
    } finally {
      setIsCreatingEntity(false);
    }
  };

  const handleDeleteEntity = async (
    entity: EntitySummary,
    sectionEntities: EntitySummary[],
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (sectionEntities.length <= 1) return;
    try {
      const res = await fetch(`/api/entities/${entity.id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadEntities();
        if (currentEntityId === entity.id) {
          const remaining = sectionEntities.filter((e) => e.id !== entity.id);
          navigate(remaining.length > 0 ? entityUrl(remaining[0]) : '/app');
        }
      }
    } catch (e) {
      console.error('Error deleting entity:', e);
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

  const content = (
    <>
      {/* Brand */}
      <div className="px-4 h-14 flex items-center border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={() => navigate('/app')}
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
          const sectionEntities = entities.filter((e) => e.type === type);
          const isCreatingHere = creatingIn === type;
          const singularLabel = label.slice(0, -1);

          return (
            <div key={type}>
              <button
                onClick={() => toggleSection(type)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActiveSection
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {sectionEntities.length > 0 && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {sectionEntities.length}
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-zinc-100 dark:border-zinc-800 pl-2">
                  {sectionEntities.map((entity) => {
                    const isActive = entity.id === currentEntityId;
                    return (
                      <div
                        key={entity.id}
                        onClick={() => navigate(entityUrl(entity))}
                        role="button"
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group cursor-pointer ${isActive
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                          }`}
                      >
                        <span className="truncate text-left">{entity.name}</span>
                        {sectionEntities.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            onClick={(e) => handleDeleteEntity(entity, sectionEntities, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}

                  {isCreatingHere ? (
                    <div className="py-1 space-y-1.5">
                      <Input
                        ref={inputRef}
                        placeholder={`${singularLabel} name`}
                        value={newEntityName}
                        onChange={(e) => setNewEntityName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateEntity(type);
                          else if (e.key === 'Escape') {
                            setCreatingIn(null);
                            setNewEntityName('');
                          }
                          e.stopPropagation();
                        }}
                        className="text-xs h-7"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="flex-1 h-6 text-xs"
                          onClick={() => handleCreateEntity(type)}
                          disabled={isCreatingEntity || !newEntityName.trim()}
                        >
                          {isCreatingEntity ? (
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
                            setNewEntityName('');
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
                        setNewEntityName('');
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
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] shrink-0 flex-col h-screen border-r bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
        {content}
      </aside>

      {/* Mobile sidebar (Sheet/drawer) */}
      <Sheet open={open} onOpenChange={(v) => !v && onClose?.()}>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>
    </>
  );
}
