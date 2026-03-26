'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from '@/lib/auth-client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TiptapMarkdownEditor } from '@/components/ui/tiptap-markdown-editor';
import {
  User,
  Users,
  CreditCard,
  Package,
  LogOut,
  Loader2,
  Send,
  Trash2,
  Upload,
  Copy,
  Check,
  X,
  FileText,
  Music,
  Bot,
  Server,
} from 'lucide-react';

type Section = 'profile' | 'team' | 'billing' | 'warehouse' | 'agent' | 'mcp';

interface TeamData {
  team: { id: string; name: string; ownerId: string };
  owner: { name: string; email: string } | null;
  members: Array<{ id: string; userId: string; name: string; email: string; role: string; joinedAt: string }>;
  invites: Array<{ id: string; email: string; name?: string | null; status: string; createdAt: string }>;
}

interface Asset {
  id: string;
  title: string;
  description: string;
  fileUrl: string;
  mimeType: string;
  source: string;
  createdAt: string;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSection?: Section;
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
  { id: 'team', label: 'Team', icon: <Users className="h-4 w-4" /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'warehouse', label: 'Assets', icon: <Package className="h-4 w-4" /> },
  { id: 'agent', label: 'Agent', icon: <Bot className="h-4 w-4" /> },
  { id: 'mcp', label: 'MCP', icon: <Server className="h-4 w-4" /> },
];

// ─── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection() {
  const { data: session } = useSession();
  const [name, setName] = useState(session?.user?.name || '');
  const [phoneNumber, setPhoneNumber] = useState((session?.user as any)?.phoneNumber || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(session?.user?.name || '');
    setPhoneNumber((session?.user as any)?.phoneNumber || '');
  }, [session]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phoneNumber }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth';
  };

  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="h-full flex flex-col gap-0">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-zinc-500">Manage your account details</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 min-h-0">
        {/* Left: identity */}
        <div className="w-full md:w-56 shrink-0 flex flex-col gap-4">
          <div className="flex flex-col items-center text-center gap-3 p-5 rounded-xl border bg-zinc-50 dark:bg-zinc-800/40">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-semibold shrink-0">
              {session?.user?.image ? (
                <img src={session.user.image} alt="Avatar" className="h-full w-full rounded-full object-cover" />
              ) : initials}
            </div>
            <div>
              <div className="font-semibold">{session?.user?.name}</div>
              <div className="text-xs text-zinc-500 mt-0.5 break-all">{session?.user?.email}</div>
            </div>
          </div>
          <div className="border-t pt-4">
            <Button variant="outline" onClick={handleSignOut} className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Right: edit form */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required disabled={isLoading} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone Number</label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1234567890" type="tel" disabled={isLoading} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="mt-auto">
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Team Section ─────────────────────────────────────────────────────────────

function TeamSection() {
  const { data: session } = useSession();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadTeam = async () => {
    try {
      const res = await fetch('/api/settings/team');
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTeam(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);
    try {
      const res = await fetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', email: inviteEmail, name: inviteName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to invite');
      setInviteSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      loadTeam();
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    await fetch('/api/settings/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeMember', memberId }),
    });
    loadTeam();
  };

  const handleCancelInvite = async (invitationId: string) => {
    await fetch('/api/settings/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancelInvite', invitationId }),
    });
    loadTeam();
  };

  const isOwner = data?.team?.ownerId === session?.user?.id;

  if (loading) {
    return <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading team...</div>;
  }

  const pendingInvites = data?.invites?.filter(i => i.status === 'pending') ?? [];

  return (
    <div className="h-full flex flex-col gap-0">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Team</h2>
        <p className="text-sm text-zinc-500">{data?.team?.name}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 min-h-0">
        {/* Left: owner + members */}
        <div className="w-full md:w-72 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Owner */}
          {data?.owner && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Owner</h3>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                  {data.owner.name?.slice(0, 2).toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{data.owner.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{data.owner.email}</div>
                </div>
                <span className="text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full shrink-0">Owner</span>
              </div>
            </div>
          )}

          {/* Members */}
          {data?.members && data.members.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Members</h3>
              <div className="space-y-2">
                {data.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold shrink-0">
                      {m.name?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-xs text-zinc-500 truncate">{m.email}</div>
                    </div>
                    <span className="text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full capitalize shrink-0">{m.role}</span>
                    {isOwner && (
                      <button onClick={() => handleRemoveMember(m.id)} className="text-zinc-400 hover:text-red-500 p-1 rounded shrink-0" title="Remove member">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!data?.members?.length && !data?.owner && (
            <div className="text-center py-8 text-zinc-400 text-sm">No team members yet.</div>
          )}
        </div>

        {/* Right: invite form + pending invites */}
        <div className="flex-1 flex flex-col gap-6 min-w-0 overflow-y-auto pr-1">
          {isOwner && (
            <div className="border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Invite Someone</h3>
              <form onSubmit={handleInvite} className="space-y-3">
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email address"
                  type="email"
                  required
                  disabled={inviting}
                />
                <Input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Name (optional)"
                  disabled={inviting}
                />
                {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
                {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}
                <Button type="submit" disabled={inviting} className="gap-2 w-full">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Invite
                </Button>
              </form>
            </div>
          )}

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Pending Invites</h3>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg border border-dashed">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{inv.name || inv.email}</div>
                      {inv.name && <div className="text-xs text-zinc-500 truncate">{inv.email}</div>}
                    </div>
                    <span className="text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-0.5 rounded-full shrink-0">Pending</span>
                    {isOwner && (
                      <button onClick={() => handleCancelInvite(inv.id)} className="text-zinc-400 hover:text-red-500 p-1 rounded shrink-0" title="Cancel invite">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isOwner && pendingInvites.length === 0 && (
            <div className="text-sm text-zinc-400">Only the team owner can invite members.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Billing Section ──────────────────────────────────────────────────────────

interface BillingData {
  plan: 'free' | 'pro';
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  credits: {
    balance: number;
    monthlyAllocation: number;
  };
}

function BillingSection() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  const loadBilling = async () => {
    try {
      const res = await fetch('/api/billing/subscription');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadBilling(); }, []);

  const handleCheckout = async (type: 'subscription' | 'credits') => {
    setError('');
    setCheckoutLoading(type);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start checkout');
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message);
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setError('');
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to open portal');
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message);
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="text-sm text-zinc-500">Manage your subscription and payments</p>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading billing info...
        </div>
      </div>
    );
  }

  const isPro = data?.plan === 'pro';
  const creditPct = data ? Math.min(100, (data.credits.balance / data.credits.monthlyAllocation) * 100) : 0;

  return (
    <div className="h-full flex flex-col gap-0">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-zinc-500">Manage your subscription and payments</p>
      </div>

      <div className="flex flex-col gap-4 flex-1 overflow-y-auto pr-1">
        {/* Current Plan */}
        <div className={`rounded-xl border p-5 ${isPro ? 'border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-950/30' : 'bg-zinc-50 dark:bg-zinc-800/40'}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPro ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>
                  {isPro ? 'PRO' : 'FREE'}
                </span>
                {isPro && data?.cancelAtPeriodEnd && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">Cancels at period end</span>
                )}
                {isPro && data?.status === 'past_due' && (
                  <span className="text-xs text-red-500">Payment past due</span>
                )}
              </div>
              <p className="text-sm font-semibold">{data?.planName ?? 'Free'} Plan</p>
              {isPro && data?.currentPeriodEnd && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {data.cancelAtPeriodEnd ? 'Access until' : 'Renews'}{' '}
                  {new Date(data.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              {!isPro && (
                <p className="text-xs text-zinc-500 mt-0.5">{data?.credits.monthlyAllocation ?? 50} credits / month</p>
              )}
            </div>
            <div className="flex gap-2">
              {isPro ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="gap-2 text-xs"
                >
                  {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                  Manage Subscription
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleCheckout('subscription')}
                  disabled={checkoutLoading === 'subscription'}
                  className="gap-2 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {checkoutLoading === 'subscription' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Upgrade to Pro
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Pro Plan Features (shown when on free) */}
        {!isPro && (
          <div className="rounded-xl border border-violet-200 dark:border-violet-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold">Pro Plan</span>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40">Most Popular</span>
            </div>
            <ul className="space-y-2 mb-4">
              {[
                '500 credits per month',
                'Priority AI processing',
                'Advanced design features',
                'Team collaboration',
              ].map((feat) => (
                <li key={feat} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <Check className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  {feat}
                </li>
              ))}
            </ul>
            <Button
              onClick={() => handleCheckout('subscription')}
              disabled={checkoutLoading === 'subscription'}
              className="gap-2 w-full bg-violet-600 hover:bg-violet-700 text-white"
              size="sm"
            >
              {checkoutLoading === 'subscription' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Upgrade to Pro
            </Button>
          </div>
        )}

        {/* Credits */}
        <div className="rounded-xl border p-5 bg-zinc-50 dark:bg-zinc-800/40">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Credits</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {data?.credits.balance ?? 0} of {data?.credits.monthlyAllocation ?? 50} remaining this month
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums">{data?.credits.balance ?? 0}</span>
          </div>
          {/* Progress bar */}
          <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all bg-violet-500"
              style={{ width: `${creditPct}%` }}
            />
          </div>
        </div>

        {/* Add-on Credits */}
        <div className="rounded-xl border p-5">
          <p className="text-sm font-semibold mb-1">Need more credits?</p>
          <p className="text-xs text-zinc-500 mb-3">Purchase a one-time credit pack to top up your balance.</p>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border mb-3">
            <div>
              <p className="text-sm font-medium">100 Credit Pack</p>
              <p className="text-xs text-zinc-500">One-time purchase, never expires</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCheckout('credits')}
              disabled={checkoutLoading === 'credits'}
              className="gap-2 text-xs shrink-0"
            >
              {checkoutLoading === 'credits' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Buy Credits
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}

// ─── Warehouse Section ────────────────────────────────────────────────────────

function WarehouseSection() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = async () => {
    try {
      const res = await fetch('/api/settings/assets');
      if (res.ok) setAssets(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAssets(); }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !title) setTitle(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploadError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('title', title);
      fd.append('description', description);
      const res = await fetch('/api/settings/assets', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setTitle('');
      setDescription('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadAssets();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/settings/assets?id=${id}`, { method: 'DELETE' });
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');
  const isVideo = (mimeType: string) => mimeType.startsWith('video/');
  const isAudio = (mimeType: string) => mimeType.startsWith('audio/');

  return (
    <div className="h-full flex flex-col gap-0">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-zinc-500">Upload assets your team can use in documents</p>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Asset grid + upload card */}
        <div className="flex-1 overflow-y-auto pr-1">
          {(() => {
            if (loading) return (
              <div className="flex items-center gap-2 text-zinc-500 pt-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading assets...</div>
            );
            if (assets.length === 0) {
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="border rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-800/40 flex flex-col">
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <h3 className="text-sm font-semibold">Upload Asset</h3>
                      <form onSubmit={handleUpload} className="flex flex-col gap-3">
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                        >
                          <Upload className="h-6 w-6 text-zinc-400 mx-auto mb-1" />
                          {selectedFile ? (
                            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 break-all">{selectedFile.name}</p>
                          ) : (
                            <>
                              <p className="text-xs text-zinc-500">Click to select a file</p>
                              <p className="text-[10px] text-zinc-400 mt-0.5">Images, PDF, Video, Audio</p>
                            </>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,video/mp4,video/webm,video/ogg,video/quicktime,audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/webm"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </div>
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Title"
                          required
                          disabled={uploading}
                          className="text-xs"
                        />
                        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                        <Button
                          type="submit"
                          disabled={!selectedFile || !title || uploading}
                          className="gap-2 w-full text-xs"
                          size="sm"
                        >
                          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {uploading ? 'Uploading…' : 'Upload'}
                        </Button>
                      </form>
                    </div>
                  </div>
                  <div className="border rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-800/40 flex flex-col items-center justify-center p-4 col-span-2">
                    <Package className="h-8 w-8 text-zinc-300 mb-2" />
                    <p className="text-xs text-zinc-400 text-center">No assets yet. Upload your first asset.</p>
                  </div>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {assets.map((asset) => (
                  <div key={asset.id} className="border rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-800/40 flex flex-col">
                    <div className="h-24 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                      {isImage(asset.mimeType) ? (
                        <img src={`/api/assets/image?id=${asset.id}`} alt={asset.title} className="h-full w-full object-cover" />
                      ) : isVideo(asset.mimeType) ? (
                        <video src={asset.fileUrl} className="h-full w-full object-cover" muted preload="metadata" />
                      ) : isAudio(asset.mimeType) ? (
                        <Music className="h-9 w-9 text-zinc-400" />
                      ) : (
                        <FileText className="h-9 w-9 text-zinc-400" />
                      )}
                    </div>
                    <div className="p-2.5 flex-1 flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold truncate flex-1">{asset.title}</p>
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${asset.source === 'uploaded'
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                          }`}>
                          {asset.source === 'uploaded' ? 'UPLOADED' : 'CHAT'}
                        </span>
                      </div>
                      {asset.description && <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">{asset.description}</p>}
                      <div className="flex gap-1 mt-auto pt-2">
                        <button
                          onClick={() => handleCopy(asset.id, asset.fileUrl)}
                          className="flex-1 flex items-center justify-center gap-1 text-[11px] border rounded-md py-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                          title="Copy URL"
                        >
                          {copiedId === asset.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          {copiedId === asset.id ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={() => handleDelete(asset.id)}
                          className="flex items-center justify-center p-1 border rounded-md text-zinc-400 hover:text-red-500 hover:border-red-200 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="border rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-800/40 flex flex-col">
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <h3 className="text-sm font-semibold">Upload Asset</h3>
                    <form onSubmit={handleUpload} className="flex flex-col gap-3">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                      >
                        <Upload className="h-6 w-6 text-zinc-400 mx-auto mb-1" />
                        {selectedFile ? (
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 break-all">{selectedFile.name}</p>
                        ) : (
                          <>
                            <p className="text-xs text-zinc-500">Click to select a file</p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">PNG, JPEG, WebP, PDF</p>
                          </>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </div>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title"
                        required
                        disabled={uploading}
                        className="text-xs"
                      />
                      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                      <Button
                        type="submit"
                        disabled={!selectedFile || !title || uploading}
                        className="gap-2 w-full text-xs"
                        size="sm"
                      >
                        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        {uploading ? 'Uploading…' : 'Upload'}
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Section ───────────────────────────────────────────────────────────────

function AgentSection() {
  const { data: session } = useSession();
  const [designGuidelines, setDesignGuidelines] = useState('');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const loadAgentSettings = async () => {
    try {
      const res = await fetch('/api/settings/agent');
      if (res.ok) {
        const data = await res.json();
        setDesignGuidelines(data.designGuidelines || '');
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => { loadAgentSettings(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designGuidelines }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save agent settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeUrl = async () => {
    if (!url) return;
    setError('');
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/settings/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to analyze website');

      // Prepend the analysis to existing guidelines or replace if empty
      const analysis = json.analysis;
      const updatedGuidelines = designGuidelines ? `${analysis}\n\n${designGuidelines}` : analysis;
      setDesignGuidelines(updatedGuidelines);
      setUrl('');

      // Auto-save after successful analysis
      await saveGuidelines(updatedGuidelines);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveGuidelines = async (guidelines: string) => {
    try {
      const res = await fetch('/api/settings/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designGuidelines: guidelines }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch (err: any) {
      console.error('Auto-save failed:', err.message);
    }
  };

  return (
    <div className="h-full flex flex-col gap-0">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Agent</h2>
        <p className="text-sm text-zinc-500">Configure design guidelines and website analysis for your AI agent</p>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {/* URL Analysis Section */}
        <div className="border-b border-t pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <h3 className="text-sm font-semibold">Analyze website</h3>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter website URL (e.g., https://example.com)"
              disabled={isAnalyzing}
              className="flex-1"
            />
            <Button
              onClick={handleAnalyzeUrl}
              disabled={!url || isAnalyzing}
              className="gap-2"
              type="button"
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            The agent will analyze the website's design elements, colors, fonts, spacing, and other visual characteristics. Results will be auto-saved.
          </p>
        </div>

        {/* Design Guidelines Section */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Design Guidelines</h3>
            <form onSubmit={handleSave} className="flex gap-2">
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                disabled={isLoading}
                className="gap-2"
                size="sm"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                {saved ? 'Saved!' : 'Save'}
              </Button>
            </form>
          </div>
          <TiptapMarkdownEditor
            value={designGuidelines}
            onChange={setDesignGuidelines}
            placeholder="## Design Guidelines

Enter your design guidelines here. Use the toolbar to format text with headers, bold, italic, links, lists, and more.

### Examples:

#### Colors
- **Primary**: `#3B82F6` (Blue)
- **Secondary**: `#10B981` (Green) 
- **Accent**: `#F59E0B` (Amber)

#### Typography
- **Headings**: Inter font, bold
- **Body**: Inter font, regular
- **Code**: `Fira Code` monospace

#### Spacing
- **Base unit**: 4px
- **Small gaps**: 8px
- **Medium gaps**: 16px
- **Large gaps**: 24px

#### Layout
- **CSS Grid** for main layouts
- **Flexbox** for component alignment
- **Mobile-first** responsive design

#### Brand Guidelines
- **Consistent color palette**
- **8px rounded corners**
- **Subtle shadows for depth**
- **Clean, minimal aesthetic"
            disabled={isLoading}
            height="400px"
          />
          <p className="text-xs text-zinc-500 mb-4">
            These guidelines will be automatically included in the AI agent's system prompt when generating designs. Use Markdown formatting for better organization.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── MCP Section ─────────────────────────────────────────────────────────────

interface McpTokenState {
  hasToken: boolean;
  tokenPreview: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

interface McpOAuthClientState {
  hasClient: boolean;
  clientId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  disabled: boolean;
  clientSecret?: string | null;
  redirectURLs: string[];
}


function McpSection() {
  const [serverUrl, setServerUrl] = useState('');
  const [tokenState, setTokenState] = useState<McpTokenState | null>(null);
  const [oauthClientState, setOauthClientState] = useState<McpOAuthClientState | null>(null);
  const [newToken, setNewToken] = useState('');
  const [newClientSecret, setNewClientSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingOAuthClient, setGeneratingOAuthClient] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokingOAuthClient, setRevokingOAuthClient] = useState(false);
  const [copied, setCopied] = useState<'url' | 'token' | 'config' | 'oauth-client-id' | 'oauth-client-secret' | null>(null);
  const [error, setError] = useState('');

  const loadMcpState = async () => {
    try {
      const [tokenRes, oauthClientRes] = await Promise.all([
        fetch('/api/settings/mcp-token'),
        fetch('/api/settings/mcp-oauth-client'),
      ]);

      const tokenData = await tokenRes.json();
      const oauthClientData = await oauthClientRes.json();

      if (!tokenRes.ok) throw new Error(tokenData.error || 'Failed to load MCP token');
      if (!oauthClientRes.ok) throw new Error(oauthClientData.error || 'Failed to load MCP OAuth client');

      setTokenState(tokenData);
      setOauthClientState(oauthClientData);
    } catch (err: any) {
      setError(err.message || 'Failed to load MCP settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerUrl(`${window.location.origin}/api/mcp`);
    }
    void loadMcpState();
  }, []);

  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    try {
      const res = await fetch('/api/settings/mcp-token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate token');
      setNewToken(data.token);
      setTokenState({
        hasToken: true,
        tokenPreview: data.tokenPreview,
        createdAt: data.createdAt,
        lastUsedAt: data.lastUsedAt,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to generate token');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    setError('');
    setRevoking(true);
    try {
      const res = await fetch('/api/settings/mcp-token', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke token');
      setNewToken('');
      setTokenState({
        hasToken: false,
        tokenPreview: null,
        createdAt: null,
        lastUsedAt: null,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to revoke token');
    } finally {
      setRevoking(false);
    }
  };

  const handleGenerateOAuthClient = async () => {
    setError('');
    setGeneratingOAuthClient(true);
    try {
      const res = await fetch('/api/settings/mcp-oauth-client', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate MCP OAuth client');
      setNewClientSecret(data.clientSecret || '');
      setOauthClientState({
        hasClient: true,
        clientId: data.clientId,
        createdAt: data.createdAt,
        updatedAt: data.createdAt,
        disabled: false,
        redirectURLs: data.redirectURLs || [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to generate MCP OAuth client');
    } finally {
      setGeneratingOAuthClient(false);
    }
  };

  const handleRevokeOAuthClient = async () => {
    setError('');
    setRevokingOAuthClient(true);
    try {
      const res = await fetch('/api/settings/mcp-oauth-client', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke MCP OAuth client');
      setNewClientSecret('');
      setOauthClientState({
        hasClient: false,
        clientId: null,
        createdAt: null,
        updatedAt: null,
        disabled: false,
        redirectURLs: [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to revoke MCP OAuth client');
    } finally {
      setRevokingOAuthClient(false);
    }
  };

  const copyValue = async (value: string, key: 'url' | 'token' | 'config' | 'oauth-client-id' | 'oauth-client-secret') => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };



  return (
    <div className="h-full flex flex-col gap-0">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">MCP Server</h2>
        <p className="text-sm text-zinc-500">Connect Guidenco to an external MCP client over Streamable HTTP.</p>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto pr-1 space-y-5">
        <div className="rounded-xl border p-4 bg-zinc-50 dark:bg-zinc-800/40 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Server URL</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Use the Streamable HTTP endpoint below in your MCP client.</p>
            </div>
            {serverUrl && (
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void copyValue(serverUrl, 'url')}>
                {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === 'url' ? 'Copied' : 'Copy URL'}
              </Button>
            )}
          </div>
          <Input value={serverUrl} readOnly className="font-mono text-xs" />
          <div className="text-xs text-zinc-500 space-y-1">
            <p>The primary transport is `streamable-http`.</p>
            <p>Remote MCP clients must send an `Authorization: Bearer ...` header when connecting to this endpoint.</p>
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Access Token</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Generate a token for MCP clients. Regenerating revokes the previous one.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {tokenState?.hasToken ? 'Regenerate Token' : 'Generate Token'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleRevoke} disabled={revoking || !tokenState?.hasToken} className="gap-2">
                {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Revoke
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading token state...
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-900/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Current Token</p>
                <p className="text-sm font-medium">{tokenState?.tokenPreview || 'No active token'}</p>
                {tokenState?.createdAt && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Created {new Date(tokenState.createdAt).toLocaleString()}
                  </p>
                )}
                {tokenState?.lastUsedAt && (
                  <p className="text-xs text-zinc-500">
                    Last used {new Date(tokenState.lastUsedAt).toLocaleString()}
                  </p>
                )}
              </div>

            </div>
          )}

          {newToken && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Copy this token now</p>
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void copyValue(newToken, 'token')}>
                  {copied === 'token' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === 'token' ? 'Copied' : 'Copy Token'}
                </Button>
              </div>
              <Input value={newToken} readOnly className="font-mono text-xs bg-white dark:bg-zinc-900" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This full token is only shown immediately after generation.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Claude OAuth Client</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Generate a Better Auth OAuth client for Claude's native remote MCP flow.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleGenerateOAuthClient} disabled={generatingOAuthClient} className="gap-2">
                {generatingOAuthClient ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {oauthClientState?.hasClient ? 'Regenerate Client' : 'Generate Client'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleRevokeOAuthClient} disabled={revokingOAuthClient || !oauthClientState?.hasClient} className="gap-2">
                {revokingOAuthClient ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Revoke
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading OAuth client state...
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Current Client ID</p>
                  {oauthClientState?.clientId && (
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void copyValue(oauthClientState.clientId!, 'oauth-client-id')}>
                      {copied === 'oauth-client-id' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === 'oauth-client-id' ? 'Copied' : 'Copy Client ID'}
                    </Button>
                  )}
                </div>
                <p className="text-sm font-medium break-all">{oauthClientState?.clientId || 'No active OAuth client'}</p>
                {oauthClientState?.createdAt && (
                  <p className="text-xs text-zinc-500">Created {new Date(oauthClientState.createdAt).toLocaleString()}</p>
                )}
                {newClientSecret && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">Client Secret <span className="text-amber-500">(shown once — copy now)</span></p>
                      <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void copyValue(newClientSecret, 'oauth-client-secret')}>
                        {copied === 'oauth-client-secret' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === 'oauth-client-secret' ? 'Copied' : 'Copy Secret'}
                      </Button>
                    </div>
                    <p className="text-sm font-mono break-all bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">{newClientSecret}</p>
                  </div>
                )}
                {oauthClientState?.redirectURLs?.length ? (
                  <div className="text-xs text-zinc-500 space-y-1">
                    {oauthClientState.redirectURLs.map((redirectUrl) => (
                      <p key={redirectUrl}>{redirectUrl}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

        </div>


        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function SettingsModal({ open, onOpenChange, defaultSection = 'profile' }: SettingsModalProps) {
  const [section, setSection] = useState<Section>(defaultSection);

  useEffect(() => {
    if (open) setSection(defaultSection);
  }, [open, defaultSection]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-full !max-w-full !h-dvh !rounded-none !border-0 p-0 gap-0 overflow-hidden flex flex-col md:!inset-auto md:!top-[50%] md:!left-[50%] md:!translate-x-[-50%] md:!translate-y-[-50%] md:w-[min(94vw,1240px)]! md:max-w-[min(94vw,1240px)]! md:h-[min(820px,94dvh)]! md:rounded-lg! md:border!">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Nav — horizontal on mobile, vertical on desktop */}
          <div className="md:w-48 shrink-0 border-b md:border-b-0 md:border-r bg-zinc-50 dark:bg-zinc-900 md:p-3 flex flex-row md:flex-col overflow-x-auto">
            <div className="hidden md:block px-2 py-1.5 mb-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Settings</p>
            </div>
            <nav className="flex flex-row md:flex-col gap-0.5 flex-1 p-2 md:p-0">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`flex items-center gap-2 px-3 py-2 md:px-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap ${section === item.id
                    ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-zinc-800/60'
                    }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {section === 'profile' && <ProfileSection />}
            {section === 'team' && <TeamSection />}
            {section === 'billing' && <BillingSection />}
            {section === 'warehouse' && <WarehouseSection />}
            {section === 'agent' && <AgentSection />}
            {section === 'mcp' && <McpSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
