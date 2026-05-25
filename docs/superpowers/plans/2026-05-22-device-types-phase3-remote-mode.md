# Device Types — Phase 3 (Remote Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users provision a managed Linux desktop sandbox in one click from the dashboard. The sandbox runs the `guidenco-client` package (shipped in Phase 2) and connects back to the server as a normal device, supporting the same Auto + Manual experience.

**Architecture:** A new server module wraps the e2b SDK with `createSandbox` and `terminateSandbox`. A new `POST /api/devices/remote` route creates the device row, generates a token, calls `createSandbox`, and stores the sandbox id in `devices.metadata`. The sandbox boots, downloads the package from the Phase 2 tarball endpoint, and runs `guidenco-client run` with a pre-written config file. A janitor running every 5 minutes in the custom server kills sandboxes for any Remote device offline > 1 hour. The Add Device wizard's Remote card becomes available — no OS chooser, no pairing code.

**Tech Stack:** Next.js 16 (custom server), TypeScript, Drizzle ORM, e2b SDK (`e2b` npm package), Tailwind, lucide-react.

---

## File Map

### Created

| Path | Responsibility |
|------|----------------|
| `web/lib/sandbox.ts` | `createSandbox(deviceId, deviceToken, cloudUrl) → sandboxId` + `terminateSandbox(sandboxId)` |
| `web/lib/sandbox-janitor.ts` | `startSandboxJanitor()` — interval timer that terminates idle sandboxes |
| `web/app/api/devices/remote/route.ts` | `POST /api/devices/remote` — provision a Remote device |
| `web/lib/sandbox.test.ts` | Unit tests for sandbox.ts (mocked e2b SDK) |
| `web/lib/sandbox-janitor.test.ts` | Unit tests for janitor (mocked DB + sandbox) |

### Modified

| Path | Change |
|------|--------|
| `web/package.json` | Add `e2b` dependency |
| `web/app/api/devices/[id]/route.ts` | DELETE: if `deviceType='remote'`, call `terminateSandbox(metadata.sandboxId)` before deleting the row |
| `web/server.ts` | Call `startSandboxJanitor()` once during `app.prepare()` |
| `web/components/AddDeviceModal.tsx` | Flip Remote `available: true`; skip OS step for Remote; show name-only details with **Provision** button that POSTs `/api/devices/remote` |

### Untouched

- `guidenco_client/` — Phase 2 package runs unchanged inside the sandbox
- `service/` — Bridged is untouched
- `web/lib/db/schema.ts` — Phase 1 columns (`deviceType`, `metadata`) already cover Remote

---

## Environment

Add this to your `.env.local` (the janitor and provisioner read it from `process.env`):

```
E2B_API_KEY=e2b_live_xxxxxxxxxxxxxxxx
E2B_TEMPLATE=desktop
```

`E2B_TEMPLATE` defaults to the string `"desktop"` if unset; this is e2b's standard X11 desktop template.

---

## Task 1: e2b dependency + `sandbox.ts` wrapper

**Files:**
- Modify: `web/package.json`
- Create: `web/lib/sandbox.ts`
- Create: `web/lib/sandbox.test.ts`

- [ ] **Step 1: Add the e2b dependency**

```bash
cd /Users/ronnel/Desktop/guidenco/web
npm install e2b
```

Verify the entry now appears in `web/package.json` under `dependencies` (something like `"e2b": "^1.x.x"`).

- [ ] **Step 2: Write the failing unit tests**

Create `web/lib/sandbox.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the e2b module BEFORE importing sandbox.ts. We can't use vi.mock at the
// top level here because we need to read what was called per-test, so we use
// vi.hoisted + vi.mock with a factory.
const mocks = vi.hoisted(() => {
  const sandbox = {
    sandboxId: 'sbx_test_abc',
    commands:  { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }) },
    kill:      vi.fn().mockResolvedValue(undefined),
    setTimeout: vi.fn().mockResolvedValue(undefined),
  }
  const Sandbox = {
    create: vi.fn().mockResolvedValue(sandbox),
    kill:   vi.fn().mockResolvedValue(undefined),
  }
  return { sandbox, Sandbox }
})

vi.mock('e2b', () => ({ Sandbox: mocks.Sandbox }))

describe('sandbox', () => {
  beforeEach(() => {
    process.env.E2B_API_KEY = 'e2b_test_key'
    delete process.env.E2B_TEMPLATE
    mocks.Sandbox.create.mockClear()
    mocks.Sandbox.kill.mockClear()
    mocks.sandbox.commands.run.mockClear()
  })

  describe('createSandbox', () => {
    it('uses the default desktop template when E2B_TEMPLATE is unset', async () => {
      const { createSandbox } = await import('./sandbox')
      await createSandbox('dev-1', 'tok-1', 'http://example.local')
      expect(mocks.Sandbox.create).toHaveBeenCalledWith('desktop', expect.objectContaining({ apiKey: 'e2b_test_key' }))
    })

    it('uses E2B_TEMPLATE when set', async () => {
      process.env.E2B_TEMPLATE = 'guidenco-custom'
      vi.resetModules()
      const { createSandbox } = await import('./sandbox')
      await createSandbox('dev-1', 'tok-1', 'http://example.local')
      expect(mocks.Sandbox.create).toHaveBeenCalledWith('guidenco-custom', expect.any(Object))
    })

    it('writes the device.json config and starts guidenco-client in the sandbox', async () => {
      const { createSandbox } = await import('./sandbox')
      await createSandbox('dev-1', 'tok-1', 'http://example.local')
      const calls = mocks.sandbox.commands.run.mock.calls.map(c => c[0])
      const allScripts = calls.join('\n')
      expect(allScripts).toContain('dev-1')
      expect(allScripts).toContain('tok-1')
      expect(allScripts).toContain('http://example.local')
      expect(allScripts).toContain('/api/install/self/package.tar.gz')
      expect(allScripts).toContain('guidenco-client')
    })

    it('returns the sandbox id', async () => {
      const { createSandbox } = await import('./sandbox')
      const id = await createSandbox('dev-1', 'tok-1', 'http://example.local')
      expect(id).toBe('sbx_test_abc')
    })

    it('throws a clear error if E2B_API_KEY is missing', async () => {
      delete process.env.E2B_API_KEY
      vi.resetModules()
      const { createSandbox } = await import('./sandbox')
      await expect(createSandbox('dev-1', 'tok-1', 'http://example.local')).rejects.toThrow(/E2B_API_KEY/)
    })
  })

  describe('terminateSandbox', () => {
    it('calls Sandbox.kill with the sandbox id and api key', async () => {
      const { terminateSandbox } = await import('./sandbox')
      await terminateSandbox('sbx_existing_123')
      expect(mocks.Sandbox.kill).toHaveBeenCalledWith('sbx_existing_123', expect.objectContaining({ apiKey: 'e2b_test_key' }))
    })

    it('does not throw if kill fails (idempotent — sandbox may already be gone)', async () => {
      mocks.Sandbox.kill.mockRejectedValueOnce(new Error('NotFound'))
      const { terminateSandbox } = await import('./sandbox')
      await expect(terminateSandbox('sbx_gone')).resolves.toBeUndefined()
    })
  })
})
```

- [ ] **Step 3: Run tests — they should FAIL**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run lib/sandbox.test.ts 2>&1 | tail -25
```

Expected: tests fail because `web/lib/sandbox.ts` doesn't exist yet.

- [ ] **Step 4: Implement `sandbox.ts`**

Create `web/lib/sandbox.ts`:

```typescript
/**
 * sandbox.ts — wraps the e2b SDK for managed Remote desktops.
 *
 * Each Remote device gets a long-lived e2b sandbox. We boot the sandbox, drop
 * the device's config in place, download the guidenco-client package from our
 * own /api/install/self/package.tar.gz endpoint, install it, and start it in
 * the background. The sandbox then behaves like any other Self-mode client.
 *
 * The e2b API key is server-side only (process.env.E2B_API_KEY). The user does
 * NOT supply their own key — Remote sandboxes are app-owned.
 */
import { Sandbox } from 'e2b'

const TEMPLATE = process.env.E2B_TEMPLATE ?? 'desktop'

// 12 hours; the janitor terminates after 1 hour offline, but we want the
// sandbox to outlive any transient browser disconnects.
const SANDBOX_TIMEOUT_MS = 12 * 60 * 60 * 1000

function apiKey(): string {
  const key = process.env.E2B_API_KEY
  if (!key) throw new Error('E2B_API_KEY is not set — cannot provision Remote sandboxes')
  return key
}

/** Boots a sandbox, installs guidenco-client, and starts it. Returns the sandbox id. */
export async function createSandbox(deviceId: string, deviceToken: string, cloudUrl: string): Promise<string> {
  const sandbox = await Sandbox.create(TEMPLATE, {
    apiKey:    apiKey(),
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })

  // The config file the Phase-2 CLI's `run` subcommand reads.
  const config = JSON.stringify({
    cloud_url:    cloudUrl,
    device_id:    deviceId,
    device_token: deviceToken,
  })

  // Bootstrap script — runs inside the sandbox. Uses bash so heredocs and pipes
  // behave predictably. nohup lets the client outlive the spawning shell.
  const bootstrap = `
set -euo pipefail

mkdir -p ~/.config/guidenco-client
cat > ~/.config/guidenco-client/device.json <<'EOF'
${config}
EOF

mkdir -p /opt/guidenco
curl -fsSL "${cloudUrl}/api/install/self/package.tar.gz" | tar -xz -C /opt/guidenco

python3 -m venv /opt/guidenco/venv
/opt/guidenco/venv/bin/pip install --quiet --upgrade pip
/opt/guidenco/venv/bin/pip install --quiet /opt/guidenco/guidenco_client

nohup /opt/guidenco/venv/bin/guidenco-client run > /tmp/guidenco-client.log 2>&1 &
`

  await sandbox.commands.run(bootstrap)

  return sandbox.sandboxId
}

/** Terminates a sandbox. Idempotent — swallows "not found" errors. */
export async function terminateSandbox(sandboxId: string): Promise<void> {
  try {
    await Sandbox.kill(sandboxId, { apiKey: apiKey() })
  } catch (err) {
    // Sandbox already terminated, expired, or never existed — don't propagate.
    console.warn(`[sandbox] terminate(${sandboxId}) ignored:`, err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Step 5: Run tests — they should PASS**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run lib/sandbox.test.ts 2>&1 | tail -15
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add web/package.json web/package-lock.json web/lib/sandbox.ts web/lib/sandbox.test.ts
git commit -m "feat(server): e2b sandbox wrapper for Remote devices (create + terminate)"
```

---

## Task 2: `POST /api/devices/remote`

**Files:**
- Create: `web/app/api/devices/remote/route.ts`

- [ ] **Step 1: Create the route**

`web/app/api/devices/remote/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { generateDeviceToken } from '@/lib/utils'
import { createSandbox, terminateSandbox } from '@/lib/sandbox'

// Resolve the public origin of this server for the sandbox to call back to.
function originFromRequest(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const host = forwardedHost ?? req.headers.get('host') ?? 'localhost'
  const proto = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { name?: string } | null
  const name = body?.name?.trim()
  if (!name) {
    return Response.json({ error: 'name required' }, { status: 400 })
  }

  // 1. Create the device row up front so we can pass deviceId + token to the sandbox.
  const deviceToken = generateDeviceToken()
  const [device] = await db
    .insert(devices)
    .values({
      userId:      session.user.id,
      name,
      deviceToken,
      status:      'offline',
      deviceType:  'remote',
      os:          'linux',
      metadata:    null,
    })
    .returning({ id: devices.id })

  // 2. Provision the sandbox. If this fails, delete the orphan row.
  let sandboxId: string
  try {
    sandboxId = await createSandbox(device.id, deviceToken, originFromRequest(req))
  } catch (err) {
    await db.delete(devices).where(eq(devices.id, device.id))
    const msg = err instanceof Error ? err.message : 'sandbox provisioning failed'
    return Response.json({ error: msg }, { status: 500 })
  }

  // 3. Stash the sandbox id so the DELETE handler and janitor can terminate it.
  await db
    .update(devices)
    .set({ metadata: { sandboxId } })
    .where(eq(devices.id, device.id))

  return Response.json({ id: device.id, name, sandboxId })
}

// If the user reloads the page mid-provision and a stale request races with a
// session timeout, we want to make sure orphan sandboxes get killed. The
// janitor handles this asynchronously, but exporting terminateSandbox here
// also makes it easy to write integration tests later. (No GET / PUT for now.)
export { terminateSandbox }
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -10
```

Expected: no errors outside of pre-existing `lib/agent.ts`.

- [ ] **Step 3: Auth + validation smoke test**

With the dev server running, the route should:
- 401 for unauthenticated requests:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/devices/remote -H 'Content-Type: application/json' -d '{"name":"X"}'
  ```
  Expected: `401`
- 400 for missing name (need to be authenticated; can skip if you don't have a cookie handy). Manual smoke is enough.

- [ ] **Step 4: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add web/app/api/devices/remote/
git commit -m "feat(api): POST /api/devices/remote — provision e2b sandbox for Remote devices"
```

---

## Task 3: `DELETE /api/devices/[id]` — terminate sandbox for Remote

**Files:**
- Modify: `web/app/api/devices/[id]/route.ts`

The existing DELETE handler unconditionally deletes the row. We need it to fetch the device first; if it's a Remote device with a `sandboxId` in metadata, terminate the sandbox before deleting.

- [ ] **Step 1: Update the DELETE handler**

Open `web/app/api/devices/[id]/route.ts`. Find the existing DELETE function:

```typescript
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [deleted] = await db
    .delete(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id })
```

…and replace it with this version (which fetches first, kills the sandbox if Remote, then deletes):

```typescript
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Look up the device first so we can kill the e2b sandbox (if any) before
  // the row disappears.
  const [device] = await db
    .select({
      id:         devices.id,
      deviceType: devices.deviceType,
      metadata:   devices.metadata,
    })
    .from(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) return Response.json({ error: 'Not found' }, { status: 404 })

  if (device.deviceType === 'remote') {
    const sandboxId = (device.metadata as { sandboxId?: string } | null)?.sandboxId
    if (sandboxId) {
      const { terminateSandbox } = await import('@/lib/sandbox')
      await terminateSandbox(sandboxId)  // idempotent; swallows errors
    }
  }

  const [deleted] = await db
    .delete(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id })
```

Keep the rest of the function (the `if (!deleted)` branch and the final `return`) as-is.

The dynamic `import('@/lib/sandbox')` keeps the e2b SDK out of the cold-start bundle for non-DELETE requests.

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add web/app/api/devices/\[id\]/route.ts
git commit -m "feat(api): DELETE /api/devices/[id] terminates e2b sandbox for Remote devices"
```

---

## Task 4: Sandbox janitor (auto-terminate idle Remote)

**Files:**
- Create: `web/lib/sandbox-janitor.ts`
- Create: `web/lib/sandbox-janitor.test.ts`
- Modify: `web/server.ts`

The janitor scans the `devices` table every 5 minutes for Remote devices that have been offline > 1 hour, terminates their sandboxes, and clears `metadata.sandboxId`. The device row stays (so the user can delete it explicitly or re-provision later).

- [ ] **Step 1: Write the failing tests**

`web/lib/sandbox-janitor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB module and sandbox module BEFORE the janitor imports them.
const mocks = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateRun:  vi.fn().mockResolvedValue(undefined),
  terminate:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => mocks.selectRows() }) }),
    update: () => ({ set: () => ({ where: () => mocks.updateRun() }) }),
  },
}))

vi.mock('./db/schema', () => ({
  devices: {
    deviceType: 'device_type',
    status:     'status',
    lastSeenAt: 'last_seen_at',
    metadata:   'metadata',
    id:         'id',
  },
}))

vi.mock('./sandbox', () => ({
  terminateSandbox: mocks.terminate,
}))

describe('reapIdleSandboxes', () => {
  beforeEach(() => {
    mocks.selectRows.mockReset()
    mocks.updateRun.mockReset().mockResolvedValue(undefined)
    mocks.terminate.mockReset().mockResolvedValue(undefined)
  })

  it('terminates sandboxes for offline Remote devices found by the query', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: { sandboxId: 'sbx_1' } },
      { id: 'd2', metadata: { sandboxId: 'sbx_2' } },
    ])
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.terminate).toHaveBeenCalledWith('sbx_1')
    expect(mocks.terminate).toHaveBeenCalledWith('sbx_2')
  })

  it('skips rows whose metadata has no sandboxId', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: null },
      { id: 'd2', metadata: {} },
    ])
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.terminate).not.toHaveBeenCalled()
  })

  it('clears metadata.sandboxId after successful termination', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: { sandboxId: 'sbx_1' } },
    ])
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.updateRun).toHaveBeenCalledTimes(1)
  })

  it('continues if one termination throws (does not stop the batch)', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: { sandboxId: 'sbx_1' } },
      { id: 'd2', metadata: { sandboxId: 'sbx_2' } },
    ])
    mocks.terminate.mockRejectedValueOnce(new Error('boom'))
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.terminate).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests — they should FAIL (module does not exist)**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run lib/sandbox-janitor.test.ts 2>&1 | tail -15
```

Expected: failure with module-not-found.

- [ ] **Step 3: Implement the janitor**

`web/lib/sandbox-janitor.ts`:

```typescript
/**
 * sandbox-janitor.ts — periodically terminates e2b sandboxes for Remote
 * devices that have been offline > IDLE_MS. The device row stays around so
 * the user can re-provision (TODO future) or delete it; we just kill the
 * compute and clear metadata.sandboxId.
 */
import { db } from './db/client'
import { devices } from './db/schema'
import { and, eq, lt, sql } from 'drizzle-orm'
import { terminateSandbox } from './sandbox'

const IDLE_MS    = 60 * 60 * 1000      // 1 hour
const INTERVAL_MS = 5 * 60 * 1000      // 5 minutes

let _timer: ReturnType<typeof setInterval> | null = null

/** Find offline Remote devices, terminate their sandboxes, clear metadata. */
export async function reapIdleSandboxes(): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_MS)

  const rows = await db
    .select({ id: devices.id, metadata: devices.metadata })
    .from(devices)
    .where(
      and(
        eq(devices.deviceType, 'remote'),
        eq(devices.status, 'offline'),
        // lastSeenAt < cutoff. Null lastSeenAt means "never connected" —
        // also a candidate (sandbox might have failed to start).
        sql`(${devices.lastSeenAt} IS NULL OR ${devices.lastSeenAt} < ${cutoff})`,
      ),
    )

  for (const row of rows) {
    const sandboxId = (row.metadata as { sandboxId?: string } | null)?.sandboxId
    if (!sandboxId) continue

    try {
      await terminateSandbox(sandboxId)
    } catch (err) {
      console.warn(`[sandbox-janitor] terminate(${sandboxId}) failed:`, err instanceof Error ? err.message : err)
      // Fall through — still clear metadata so we don't keep retrying forever.
    }

    await db
      .update(devices)
      .set({ metadata: null })
      .where(eq(devices.id, row.id))
  }
}

/** Schedule reapIdleSandboxes() on a 5-minute interval. Idempotent. */
export function startSandboxJanitor(): void {
  if (_timer) return
  _timer = setInterval(() => {
    reapIdleSandboxes().catch((err) =>
      console.error('[sandbox-janitor] tick failed:', err instanceof Error ? err.message : err),
    )
  }, INTERVAL_MS)
  // Don't let the timer keep the process alive on its own (lets server.ts shut down cleanly).
  _timer.unref?.()
  console.log(`[sandbox-janitor] started (interval=${INTERVAL_MS / 1000}s, idle threshold=${IDLE_MS / 1000}s)`)
}
```

- [ ] **Step 4: Run tests — they should PASS**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run lib/sandbox-janitor.test.ts 2>&1 | tail -15
```

Expected: 4 passed.

- [ ] **Step 5: Wire the janitor into the custom server**

Open `web/server.ts`. Near the top imports add:
```typescript
import { startSandboxJanitor } from './lib/sandbox-janitor'
```

Then in the existing `app.prepare().then(async () => { ... })` block, immediately after the existing `await ensureBucket()` line, add:
```typescript
  startSandboxJanitor()
```

The janitor starts once at server boot and runs forever.

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -10
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add web/lib/sandbox-janitor.ts web/lib/sandbox-janitor.test.ts web/server.ts
git commit -m "feat(server): sandbox janitor — terminate Remote sandboxes idle >1h"
```

---

## Task 5: AddDeviceModal — enable Remote

**Files:**
- Modify: `web/components/AddDeviceModal.tsx`

The modal currently shows Remote with `available: false`. We flip it on, skip the OS chooser for Remote (always Linux), and add a name-only details branch that POSTs to `/api/devices/remote`.

- [ ] **Step 1: Flip Remote to available**

Find the entry with `id: 'remote'` in `TYPE_OPTIONS`. Change `available: false` to `available: true`.

- [ ] **Step 2: Skip the OS step for Remote**

The wizard's step calculation is currently:

```tsx
  const step: 'type' | 'os' | 'details' =
    type === null ? 'type' : os === null ? 'os' : 'details'
```

Replace with:

```tsx
  const step: 'type' | 'os' | 'details' =
    type === null ? 'type'
      : type === 'remote' ? 'details'         // Remote skips OS — always Linux sandbox
      : os === null ? 'os'
      : 'details'
```

And in `goBack()`:
```tsx
  function goBack() {
    setError('')
    if (os) setOs(null)
    else setType(null)
  }
```
replace with:
```tsx
  function goBack() {
    setError('')
    if (type === 'remote') { setType(null); return }
    if (os) setOs(null)
    else setType(null)
  }
```

- [ ] **Step 3: Add a Remote provision handler**

Just below the existing `handleSubmit` function, add a new `handleProvisionRemote`:

```tsx
  async function handleProvisionRemote(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/devices/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to provision Remote device')
      setLoading(false)
      return
    }

    onAdded()
    onClose()
  }
```

- [ ] **Step 4: Add the Remote details branch**

After the existing Self details branch (`{step === 'details' && type === 'self' && (...)}`) and before the modal's closing tags, add:

```tsx
        {step === 'details' && type === 'remote' && (
          <>
            <p className="text-sm text-zinc-400">
              A Linux desktop sandbox will be provisioned for you. It boots in
              about 30 seconds and connects automatically — no install, no
              pairing code.
            </p>
            <form onSubmit={handleProvisionRemote} className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Device name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My sandbox"
                  required
                  className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded border border-zinc-700 py-2 text-sm hover:border-zinc-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="flex-1 rounded bg-zinc-100 text-zinc-900 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
                >
                  {loading ? 'Provisioning…' : 'Provision Sandbox'}
                </button>
              </div>
            </form>
          </>
        )}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -10
```

Expected: clean.

- [ ] **Step 6: Manual UI sanity check**

With the dev server running, open the dashboard → **+ Add Device** → **Remote**. The wizard should jump straight to the Remote details screen (skipping OS). You should see a name field and a **Provision Sandbox** button.

(Don't click Provision unless `E2B_API_KEY` is set in `.env.local` — it will return a 500.)

- [ ] **Step 7: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add web/components/AddDeviceModal.tsx
git commit -m "feat(ui): enable Remote in Add Device wizard — name-only provisioning"
```

---

## Manual End-to-End Verification (requires `E2B_API_KEY`)

1. Set `E2B_API_KEY=...` (and optionally `E2B_TEMPLATE=desktop`) in `web/.env.local`. Restart the dev server.
2. From the dashboard: **+ Add Device** → **Remote** → name it "Cloud Test" → **Provision Sandbox**.
3. Modal closes; "Cloud Test" appears in the device list with a Cloud icon and `offline` status.
4. Within ~30–60 seconds, status flips to `online` (the sandbox finished installing and the client connected).
5. Open the device. Video should stream (Linux desktop). Auto mode and Manual mode both work.
6. Delete the device from the device-card menu (or via `DELETE /api/devices/<id>`). Verify the e2b dashboard shows the sandbox terminated.
7. Provision two more sandboxes, then `STOP` your dev server. Restart it. Don't open the devices (they stay offline). Wait 65 minutes (or temporarily lower `IDLE_MS` to 60_000 for testing). Confirm the janitor terminates both sandboxes on its next tick and clears `metadata.sandboxId` for both rows.

---

## Out of Scope (V1 future improvements)

- Re-provisioning a Remote device after the janitor terminated it (V1: delete + create again)
- Per-user e2b API keys (V1: app-owned only)
- Custom sandbox templates per user
- Sandbox region selection
- Resource limits (CPU/RAM) per sandbox
- Bringing a sandbox out of pause without re-creating
