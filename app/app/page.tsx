'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Trash2, FileText, History, LayoutTemplate, Shapes, Film, X } from 'lucide-react';
import { EntitySummary } from '@/lib/types';
import { Input } from '@/components/ui/input';

type EntityType = 'document' | 'asset' | 'video';

function entityUrl(entity: EntitySummary) {
  if (entity.type === 'asset') return `/app/assets/${entity.id}`;
  if (entity.type === 'video') return `/app/videos/${entity.id}`;
  return `/app/documents/${entity.id}`;
}

const TYPE_META = {
  document: { label: 'Document', Icon: LayoutTemplate },
  asset: { label: 'Asset', Icon: Shapes },
  video: { label: 'Video', Icon: Film },
} as const;

const CREATE_CARD_META: Array<{
  type: EntityType;
  title: string;
  description: string;
  Icon: typeof LayoutTemplate;
}> = [
    {
      type: 'asset',
      title: 'Create a new asset',
      description: 'Start a fresh SVG asset for icons, graphics, and illustrations.',
      Icon: Shapes,
    },
    {
      type: 'document',
      title: 'Create a new document',
      description: 'Build a multi-page document for decks, posters, and flyers.',
      Icon: LayoutTemplate,
    },
    {
      type: 'video',
      title: 'Create a new video',
      description: 'Create a new video with custom scenes and motion.',
      Icon: Film,
    },
  ];

function HoverPreviewVideo({ src, name }: { src: string; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => { });
  };

  const handleMouseLeave = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  return (
    <div className="w-full h-full" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`${name} preview`}
      />
    </div>
  );
}

function AssetPreviewImage({ svgContent, name }: { svgContent: string; name: string }) {
  const svgDataUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`,
    [svgContent]
  );

  return (
    <div className="w-full h-full flex items-center justify-center bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-size-[16px_16px] p-4">
      <img
        src={svgDataUrl}
        alt={name}
        className="max-w-full max-h-full object-contain drop-shadow-lg"
      />
    </div>
  );
}

function getEntityPreview(entity: EntitySummary & Record<string, any>) {
  if (entity.type === 'document' && entity.thumbnail) {
    return (
      <img
        src={entity.thumbnail}
        alt={entity.name}
        className="w-full h-full object-cover"
      />
    );
  }

  if (entity.type === 'asset' && entity.svgContent) {
    return <AssetPreviewImage svgContent={entity.svgContent} name={entity.name} />;
  }

  if (entity.type === 'video' && entity.videoUrl) {
    return <HoverPreviewVideo src={entity.videoUrl} name={entity.name} />;
  }

  return <div className="text-zinc-400 text-sm">No preview</div>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCreateType, setActiveCreateType] = useState<EntityType | null>(null);
  const [newEntityName, setNewEntityName] = useState('');
  const [isCreatingEntity, setIsCreatingEntity] = useState(false);
  const [deletingEntityId, setDeletingEntityId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadEntities();
  }, []);

  useEffect(() => {
    if (!activeCreateType) return;
    const timeoutId = window.setTimeout(() => createInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeCreateType]);

  const loadEntities = async () => {
    try {
      const response = await fetch('/api/entities');
      if (response.ok) {
        const data = await response.json();
        setEntities(data);
      }
    } catch (error) {
      console.error('Error loading entities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEntityCreated = (entityId: string, type: EntityType) => {
    if (type === 'asset') router.push(`/app/assets/${entityId}`);
    else if (type === 'video') router.push(`/app/videos/${entityId}`);
    else router.push(`/app/documents/${entityId}`);
  };

  const handleCreateCardClick = (type: EntityType) => {
    if (isCreatingEntity) return;
    setActiveCreateType(type);
    setNewEntityName('');
  };

  const handleCreateCancel = () => {
    if (isCreatingEntity) return;
    setActiveCreateType(null);
    setNewEntityName('');
  };

  const handleCreateEntity = async (type: EntityType) => {
    const name = newEntityName.trim();
    if (!name || isCreatingEntity) return;

    setIsCreatingEntity(true);

    try {
      const response = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });

      if (response.ok) {
        const entity = await response.json();
        setActiveCreateType(null);
        setNewEntityName('');
        handleEntityCreated(entity.id, type);
      }
    } catch (error) {
      console.error('Error creating entity:', error);
    } finally {
      setIsCreatingEntity(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, entityId: string) => {
    e.stopPropagation();
    setEntityToDelete(entityId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entityToDelete) return;
    setDeletingEntityId(entityToDelete);
    try {
      const response = await fetch(`/api/entities/${entityToDelete}`, { method: 'DELETE' });
      if (response.ok) {
        setEntities(entities.filter((p) => p.id !== entityToDelete));
      }
    } catch (error) {
      console.error('Error deleting entity:', error);
    } finally {
      setDeletingEntityId(null);
      setShowDeleteConfirm(false);
      setEntityToDelete(null);
    }
  };

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-zinc-950 overflow-auto">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Entities</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Create and manage your design entities
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {CREATE_CARD_META.map(({ type, title, description, Icon }) => {
            const isActive = activeCreateType === type;

            return (
              <div
                key={type}
                className="group text-left rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 md:p-6 min-h-[180px] md:min-h-[220px] flex flex-col justify-between shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
              >
                <button
                  type="button"
                  onClick={() => handleCreateCardClick(type)}
                  className="flex h-full flex-col justify-between text-left"
                >
                  <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{title}</h3>
                      <Plus className="h-5 w-5 text-zinc-400 group-hover:text-blue-500 transition-colors shrink-0" />
                    </div>
                    <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                      {description}
                    </p>
                  </div>
                </button>

                {isActive && (
                  <div className="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
                    <Input
                      ref={createInputRef}
                      placeholder={`My ${type}...`}
                      value={newEntityName}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleCreateEntity(type);
                        }

                        if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCreateCancel();
                        }
                      }}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" onClick={handleCreateCancel} disabled={isCreatingEntity}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button onClick={() => void handleCreateEntity(type)} disabled={!newEntityName.trim() || isCreatingEntity}>
                        {isCreatingEntity ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating…
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Create {TYPE_META[type].label}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : entities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entities.map((entity) => {
              const meta = TYPE_META[entity.type] ?? TYPE_META.document;
              return (
                <div
                  key={entity.id}
                  onClick={() => router.push(entityUrl(entity))}
                  className="group relative cursor-pointer bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-md mb-2 flex items-center justify-center overflow-hidden">
                    {getEntityPreview(entity as EntitySummary & Record<string, any>)}
                  </div>
                  <div className="flex items-start justify-between mt-2">
                    <h3 className="text-md font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {entity.name}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full ml-2 shrink-0">
                      <meta.Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                    Updated {new Date(entity.updatedAt).toLocaleDateString()}
                  </div>
                  {(entity as any).pageCount > 0 || (entity as any).versionCount > 0 ? (
                    <div className="flex items-center gap-2">
                      {(entity as any).pageCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          <FileText className="h-3 w-3" />
                          {(entity as any).pageCount}{' '}
                          {(entity as any).pageCount === 1 ? 'page' : 'pages'}
                        </span>
                      )}
                      {(entity as any).versionCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          <History className="h-3 w-3" />
                          {(entity as any).versionCount}{' '}
                          {(entity as any).versionCount === 1 ? 'version' : 'versions'}
                        </span>
                      )}
                    </div>
                  ) : null}
                  <button
                    onClick={(e) => handleDeleteClick(e, entity.id)}
                    disabled={deletingEntityId === entity.id}
                    className="absolute top-2 right-2 p-2 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    aria-label="Delete entity"
                  >
                    {deletingEntityId === entity.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </main>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => { setShowDeleteConfirm(false); setEntityToDelete(null); }}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Delete Entity</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Are you sure you want to delete this entity? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setEntityToDelete(null); }}>
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
