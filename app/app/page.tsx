'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Trash2, FileText, History, LayoutTemplate, Shapes, Film, X, BookOpen, Share2, Twitter, Linkedin, Instagram, Facebook, ChevronDown, FlaskConical } from 'lucide-react';
import { EntitySummary } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type EntityType = 'document' | 'asset' | 'video' | 'blog_article' | 'social_post';

function entityUrl(entity: EntitySummary) {
  if (entity.type === 'asset') return `/app/assets/${entity.id}`;
  if (entity.type === 'video') return `/app/videos/${entity.id}`;
  if (entity.type === 'blog_article') return `/app/blog-articles/${entity.id}`;
  if (entity.type === 'social_post') return `/app/social-posts/${entity.id}`;
  return `/app/documents/${entity.id}`;
}

const PLATFORM_ICONS: Record<string, typeof Twitter> = {
  twitter: Twitter,
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
};

const TYPE_META = {
  document: { label: 'Document', Icon: LayoutTemplate, description: 'Multi-page document' },
  asset: { label: 'Asset', Icon: Shapes, description: 'SVG icon or illustration' },
  video: { label: 'Video', Icon: Film, description: 'Animated video composition' },
  blog_article: { label: 'Blog Article', Icon: BookOpen, description: 'Long-form Markdown article' },
  social_post: { label: 'Social Post', Icon: Share2, description: 'LinkedIn, Twitter & more' },
} as const;

const ENTITY_TYPE_ORDER: EntityType[] = ['asset', 'document', 'video', 'blog_article', 'social_post'];

function HoverPreviewVideo({ src, name }: { src: string; name: string }) {
  return (
    <div className="w-full h-full">
      <video src={src} className="w-full h-full object-cover" muted loop playsInline preload="metadata" autoPlay aria-label={`${name} preview`} />
    </div>
  );
}

function AssetPreviewImage({ svgContent, name }: { svgContent: string; name: string }) {
  const svgDataUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`, [svgContent]);
  return (
    <div className="w-full h-full flex items-center justify-center bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-size-[16px_16px] p-4">
      <img src={svgDataUrl} alt={name} className="max-w-full max-h-full object-contain drop-shadow-lg" />
    </div>
  );
}

function BlogArticlePreview({ bannerImage, tags }: { bannerImage?: string | null; tags?: string[] }) {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-zinc-900">
      {bannerImage ? (
        <img src={bannerImage} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-r from-violet-100 to-blue-100 dark:from-violet-950 dark:to-blue-950 flex items-center justify-center">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">No banner</span>
        </div>
      )}
    </div>
  );
}

function SocialPostPreview({ content, platform }: { content: string; platform: string }) {
  const PlatformIcon = PLATFORM_ICONS[platform] || Share2;
  const colors: Record<string, string> = { twitter: 'text-sky-500', linkedin: 'text-blue-600', instagram: 'text-pink-500', facebook: 'text-blue-700' };
  return (
    <div className="w-full h-full p-3 flex flex-col gap-1.5 bg-white dark:bg-zinc-900">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${colors[platform] || 'text-zinc-500'}`}>
        <PlatformIcon className="h-3 w-3" />
        <span className="capitalize">{platform}</span>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-5">{content || 'No content yet'}</p>
    </div>
  );
}

function getEntityPreview(entity: EntitySummary & Record<string, any>) {
  if (entity.type === 'document' && entity.thumbnail) return <img src={entity.thumbnail} alt={entity.name} className="w-full h-full object-cover" />;
  if (entity.type === 'asset' && entity.svgContent) return <AssetPreviewImage svgContent={entity.svgContent} name={entity.name} />;
  if (entity.type === 'video' && entity.videoUrl) return <HoverPreviewVideo src={entity.videoUrl} name={entity.name} />;
  if (entity.type === 'blog_article') return <BlogArticlePreview bannerImage={entity.bannerImage} tags={entity.tags} />;
  if (entity.type === 'social_post') return <SocialPostPreview content={entity.content || ''} platform={entity.platform || 'linkedin'} />;
  return (
    <div className="w-full h-full flex items-center justify-center">
      {(() => { const m = (TYPE_META as any)[entity.type] ?? TYPE_META.document; return <m.Icon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />; })()}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [activeCreateType, setActiveCreateType] = useState<EntityType | null>(null);
  const [newEntityName, setNewEntityName] = useState('');
  const [isCreatingEntity, setIsCreatingEntity] = useState(false);
  const [isExperiment, setIsExperiment] = useState(false);
  const [expMaxDepth, setExpMaxDepth] = useState(3);
  const [expMaxIterations, setExpMaxIterations] = useState(5);
  const [expTimeLimit, setExpTimeLimit] = useState('');
  const [expParameters, setExpParameters] = useState<Array<{ key: string; description: string; type: 'string' | 'number' | 'boolean'; stringValue: string; numberValue: string; numberMin: string; numberMax: string; booleanValue: boolean }>>([]);
  const [deletingEntityId, setDeletingEntityId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadEntities(); }, []);

  useEffect(() => {
    if (!activeCreateType) return;
    const id = window.setTimeout(() => createInputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [activeCreateType]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showNewDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNewDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNewDropdown]);

  const loadEntities = async () => {
    try {
      const response = await fetch('/api/entities');
      if (response.ok) setEntities(await response.json());
    } catch (error) {
      console.error('Error loading entities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEntityCreated = (entityId: string, type: EntityType) => {
    if (type === 'asset') router.push(`/app/assets/${entityId}`);
    else if (type === 'video') router.push(`/app/videos/${entityId}`);
    else if (type === 'blog_article') router.push(`/app/blog-articles/${entityId}`);
    else if (type === 'social_post') router.push(`/app/social-posts/${entityId}`);
    else router.push(`/app/documents/${entityId}`);
  };

  const handleSelectType = (type: EntityType) => {
    setShowNewDropdown(false);
    setActiveCreateType(type);
    setNewEntityName('');
  };

  const handleCreateCancel = () => {
    if (isCreatingEntity) return;
    setActiveCreateType(null);
    setNewEntityName('');
    setIsExperiment(false);
    setExpMaxDepth(3);
    setExpMaxIterations(5);
    setExpTimeLimit('');
    setExpParameters([]);
  };

  const handleCreateEntity = async () => {
    if (!activeCreateType) return;
    const name = newEntityName.trim();
    if (!name || isCreatingEntity) return;
    setIsCreatingEntity(true);
    try {
      const response = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type: activeCreateType,
          ...(isExperiment && {
            experiment: {
              maxDepth: expMaxDepth,
              maxIterations: expMaxIterations,
              timeLimit: expTimeLimit || undefined,
              parameters: expParameters.map(p => ({
                key: p.key,
                description: p.description || undefined,
                type: p.type,
                stringValue: p.type === 'string' ? p.stringValue : undefined,
                numberValue: p.type === 'number' && p.numberValue !== '' ? Number(p.numberValue) : undefined,
                numberMin: p.type === 'number' && p.numberMin !== '' ? Number(p.numberMin) : undefined,
                numberMax: p.type === 'number' && p.numberMax !== '' ? Number(p.numberMax) : undefined,
                booleanValue: p.type === 'boolean' ? p.booleanValue : undefined,
              })).filter(p => p.key.trim()),
            },
          }),
        }),
      });
      if (response.ok) {
        const entity = await response.json();
        setActiveCreateType(null);
        setNewEntityName('');
        setIsExperiment(false);
        setExpMaxDepth(3);
        setExpMaxIterations(5);
        setExpTimeLimit('');
        setExpParameters([]);
        handleEntityCreated(entity.id, activeCreateType);
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
      if (response.ok) setEntities(entities.filter((p) => p.id !== entityToDelete));
    } catch (error) {
      console.error('Error deleting entity:', error);
    } finally {
      setDeletingEntityId(null);
      setShowDeleteConfirm(false);
      setEntityToDelete(null);
    }
  };

  const activeMeta = activeCreateType ? (TYPE_META as any)[activeCreateType] : null;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 overflow-auto">
      <main className="container mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Your Library</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isLoading ? 'Loading…' : `${entities.length} ${entities.length === 1 ? 'item' : 'items'}`}
            </p>
          </div>

          {/* New button + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <Button
              onClick={() => setShowNewDropdown(s => !s)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showNewDropdown ? 'rotate-180' : ''}`} />
            </Button>

            {showNewDropdown && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-20 overflow-hidden">
                {ENTITY_TYPE_ORDER.map((type) => {
                  const meta = (TYPE_META as any)[type];
                  return (
                    <button
                      key={type}
                      onClick={() => handleSelectType(type)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                        <meta.Icon className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{meta.label}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">{meta.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Create name dialog (inline modal) */}
        {activeCreateType && activeMeta && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={handleCreateCancel}
          >
            <div
              className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl border border-zinc-200 dark:border-zinc-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <activeMeta.Icon className="h-4.5 w-4.5 text-zinc-600 dark:text-zinc-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">New {activeMeta.label}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{activeMeta.description}</p>
                </div>
              </div>
              <Input
                ref={createInputRef}
                placeholder={`My ${activeMeta.label}…`}
                value={newEntityName}
                onChange={(e) => setNewEntityName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleCreateEntity(); }
                  if (e.key === 'Escape') { e.preventDefault(); handleCreateCancel(); }
                }}
                className="mb-4"
              />

              {/* Experiment toggle */}
              <div className="flex items-center gap-2 mb-3">
                <Checkbox
                  id="exp-toggle"
                  checked={isExperiment}
                  onCheckedChange={(v) => setIsExperiment(!!v)}
                />
                <Label htmlFor="exp-toggle" className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <FlaskConical className="h-4 w-4 text-zinc-500" />
                  Setup as an experiment
                </Label>
              </div>

              {/* Experiment fields */}
              {isExperiment && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">Max depth</Label>
                      <Input
                        type="number"
                        min={1}
                        value={expMaxDepth}
                        onChange={(e) => setExpMaxDepth(Math.max(1, parseInt(e.target.value) || 1))}
                        className="bg-white dark:bg-zinc-900 text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">Max iterations</Label>
                      <Input
                        type="number"
                        min={1}
                        value={expMaxIterations}
                        onChange={(e) => setExpMaxIterations(Math.max(1, parseInt(e.target.value) || 1))}
                        className="bg-white dark:bg-zinc-900 text-sm h-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">Time limit (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={expTimeLimit}
                      onChange={(e) => setExpTimeLimit(e.target.value)}
                      className="bg-white dark:bg-zinc-900 text-sm h-8"
                    />
                  </div>

                  {/* Parameters */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Parameters</Label>
                      <button
                        type="button"
                        onClick={() => setExpParameters(p => [...p, { key: '', description: '', type: 'string', stringValue: '', numberValue: '', numberMin: '', numberMax: '', booleanValue: false }])}
                        className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                    {expParameters.length === 0 && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No parameters added yet.</p>
                    )}
                    <div className="space-y-2">
                      {expParameters.map((param, i) => (
                        <div key={i} className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2 space-y-1.5">
                          <div className="flex gap-1.5">
                            <Input
                              placeholder="Key"
                              value={param.key}
                              onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, key: e.target.value } : p))}
                              className="text-xs h-7 flex-1"
                            />
                            <select
                              value={param.type}
                              onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, type: e.target.value as 'string' | 'number' | 'boolean' } : p))}
                              className="text-xs h-7 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5"
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="boolean">Boolean</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setExpParameters(ps => ps.filter((_, j) => j !== i))}
                              className="text-zinc-400 hover:text-red-500 px-1"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <Input
                            placeholder="Description (optional)"
                            value={param.description}
                            onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                            className="text-xs h-7"
                          />
                          {param.type === 'string' && (
                            <Input
                              placeholder="Value"
                              value={param.stringValue}
                              onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, stringValue: e.target.value } : p))}
                              className="text-xs h-7"
                            />
                          )}
                          {param.type === 'number' && (
                            <div className="grid grid-cols-3 gap-1">
                              <Input placeholder="Value" type="number" value={param.numberValue} onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, numberValue: e.target.value } : p))} className="text-xs h-7" />
                              <Input placeholder="Min" type="number" value={param.numberMin} onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, numberMin: e.target.value } : p))} className="text-xs h-7" />
                              <Input placeholder="Max" type="number" value={param.numberMax} onChange={(e) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, numberMax: e.target.value } : p))} className="text-xs h-7" />
                            </div>
                          )}
                          {param.type === 'boolean' && (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`param-bool-${i}`}
                                checked={param.booleanValue}
                                onCheckedChange={(v) => setExpParameters(ps => ps.map((p, j) => j === i ? { ...p, booleanValue: !!v } : p))}
                              />
                              <Label htmlFor={`param-bool-${i}`} className="text-xs cursor-pointer">True</Label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleCreateCancel} disabled={isCreatingEntity}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={() => void handleCreateEntity()} disabled={!newEntityName.trim() || isCreatingEntity}>
                  {isCreatingEntity ? <Loader2 className="h-4 w-4 animate-spin" /> : `Create`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Entity grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100" />
          </div>
        ) : entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Plus className="h-7 w-7 text-zinc-400" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Nothing here yet</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Click <strong>New</strong> to create your first item.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {entities.map((entity) => {
              const meta = (TYPE_META as any)[entity.type] ?? TYPE_META.document;
              return (
                <div
                  key={entity.id}
                  onClick={() => router.push(entityUrl(entity))}
                  className="group relative cursor-pointer bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all"
                >
                  <div className="aspect-video bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {getEntityPreview(entity as EntitySummary & Record<string, any>)}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                        {entity.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full shrink-0">
                        <meta.Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </div>
                    {entity.type === 'blog_article' && (entity as any).tags && (entity as any).tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {(entity as any).tags.slice(0, 4).map((tag: string) => (
                          <span key={tag} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">#{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {new Date(entity.updatedAt).toLocaleDateString()}
                      </span>
                      {(entity as any).versionCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                          <History className="h-3 w-3" />
                          {(entity as any).versionCount}v
                        </span>
                      )}
                      {(entity as any).pageCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                          <FileText className="h-3 w-3" />
                          {(entity as any).pageCount}p
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteClick(e, entity.id)}
                    disabled={deletingEntityId === entity.id}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    aria-label="Delete"
                  >
                    {deletingEntityId === entity.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => { setShowDeleteConfirm(false); setEntityToDelete(null); }}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl p-6 max-w-sm w-full mx-4 border border-zinc-200 dark:border-zinc-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">Delete this item?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setEntityToDelete(null); }}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
