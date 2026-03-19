'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import {
  ChevronDown,
  LayoutTemplate,
  Shapes,
  Film,
  Home,
  Plus,
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { EntitySummary } from '@/lib/types';
import { SettingsModal } from '@/components/settings-modal';

type EntityType = 'document' | 'asset' | 'video';

const TYPE_META: Record<EntityType, { label: string; Icon: React.ElementType }> = {
  document: { label: 'Document', Icon: LayoutTemplate },
  asset: { label: 'Asset', Icon: Shapes },
  video: { label: 'Video', Icon: Film },
};

function entityUrl(entity: EntitySummary) {
  if (entity.type === 'asset') return `/app/assets/${entity.id}`;
  if (entity.type === 'video') return `/app/videos/${entity.id}`;
  return `/app/documents/${entity.id}`;
}

function activeEntityIdFromPath(
  pathname: string | null,
  params: Record<string, string | string[]>
) {
  if (
    pathname?.includes('/assets/') ||
    pathname?.includes('/videos/') ||
    pathname?.includes('/documents/')
  ) {
    return params?.id as string | undefined;
  }
  return undefined;
}

// ─── Credits Ring ─────────────────────────────────────────────────────────────

function CreditsRing({ balance, total }: { balance: number; total: number }) {
  const safeBalance = Math.max(0, Math.min(balance, total));
  const pct = total > 0 ? Math.min(1, safeBalance / total) : 0;
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - pct);
  const isEmpty = safeBalance <= 0;
  const isLow = !isEmpty && pct <= 0.2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 28, height: 28 }}>
      <svg width="28" height="28" viewBox="0 0 24 24" className="-rotate-90">
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-zinc-200 dark:text-zinc-700"
        />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={isEmpty ? 'text-zinc-200 dark:text-zinc-700' : isLow ? 'text-orange-500' : 'text-blue-500'}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
    </div>
  );
}

// ─── Credits Badge ─────────────────────────────────────────────────────────────

function CreditsBadge() {
  const [creditsData, setCreditsData] = useState<{ balance: number; monthlyAllocation: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.credits) setCreditsData(d.credits); })
      .catch(() => { });
  }, []);

  if (!creditsData) return null;

  return (
    <>
      <button
        onClick={() => setSettingsOpen(true)}
        title={`${creditsData.balance} of ${creditsData.monthlyAllocation} credits remaining`}
        className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <CreditsRing balance={creditsData.balance} total={creditsData.monthlyAllocation} />
        <span className="hidden sm:block text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          {creditsData.balance} credits
        </span>
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} defaultSection="billing" />
    </>
  );
}

// ─── Project Dropdown ─────────────────────────────────────────────────────────

function ProjectDropdown({
  entities,
  currentEntityId,
}: {
  entities: EntitySummary[];
  currentEntityId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = entities.find((e) => e.id === currentEntityId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const navigate = (url: string) => {
    router.push(url);
    setOpen(false);
  };

  const grouped = (Object.entries(TYPE_META) as [EntityType, { label: string; Icon: React.ElementType }][])
    .map(([type, meta]) => ({
      type,
      ...meta,
      items: entities.filter((e) => e.type === type),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors max-w-[180px]"
      >
        {current ? (
          <>
            {(() => {
              const meta = TYPE_META[current.type as EntityType];
              return meta ? <meta.Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : null;
            })()}
            <span className="truncate">{current.name}</span>
          </>
        ) : (
          <>
            <Home className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span>Home</span>
          </>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400 ml-auto" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-50 overflow-hidden py-1">
          <button
            onClick={() => navigate('/app')}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${!currentEntityId
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            Home
          </button>

          {grouped.length > 0 && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1" />
          )}

          {grouped.map(({ type, label, Icon, items }) => (
            <div key={type}>
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Icon className="h-3 w-3" />
                {label}s
              </div>
              {items.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => navigate(entityUrl(entity))}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${entity.id === currentEntityId
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                >
                  <span className="truncate">{entity.name}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1">
            <button
              onClick={() => navigate('/app')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User Button ──────────────────────────────────────────────────────────────

function UserButton() {
  const { data: session } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!session?.user) return null;

  const initials =
    session.user.name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  return (
    <>
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex items-center gap-2 rounded-full pl-1.5 pr-2.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium">
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
        <div className="hidden sm:flex flex-col items-start min-w-0">
          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[120px] leading-tight">
            {session.user.name}
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[120px] leading-tight">
            {session.user.email}
          </span>
        </div>
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [entities, setEntities] = useState<EntitySummary[]>([]);

  const currentEntityId = activeEntityIdFromPath(
    pathname,
    params as Record<string, string | string[]>
  );

  useEffect(() => {
    fetch('/api/entities')
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntities)
      .catch(() => { });
  }, [pathname]);

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      {/* Left: logo + project selector */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <button
          onClick={() => router.push('/app')}
          className="text-base font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
        >
          Guidenco
        </button>
        <span className="text-zinc-300 dark:text-zinc-700 font-light select-none">/</span>
        <ProjectDropdown entities={entities} currentEntityId={currentEntityId} />
      </div>

      {/* Right: credits + user */}
      <div className="flex items-center gap-1 shrink-0">
        <CreditsBadge />
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <UserButton />
      </div>
    </header>
  );
}
