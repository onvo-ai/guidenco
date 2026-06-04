# Device Types — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the foundation for multi-type devices (Bridged / Self / Remote) without changing how the existing Raspberry Pi flow works — DB columns, claim-redeem branching, and a two-step Add Device wizard.

**Architecture:** Three new columns on `devices` (`deviceType`, `os`, `metadata`); the existing Pi continues to be `deviceType='bridged'` (default for all existing rows). The Add Device modal becomes a two-step wizard: pick a type, then fill in the details. In Phase 1 only Bridged is functional; Self and Remote appear as disabled "Coming soon" cards that Phases 2 and 3 will light up.

**Tech Stack:** Drizzle ORM, PostgreSQL, Next.js 16 (App Router), React 19, Tailwind, Better Auth, `lucide-react` icons.

---

## File Map

| File | Change |
|------|--------|
| `web/lib/db/schema.ts` | Add `deviceType`, `os`, `metadata` columns to `devices` |
| `web/app/api/devices/claim-redeem/route.ts` | Accept optional `deviceType` + `os` in body; store on insert |
| `web/app/api/devices/route.ts` | Return `deviceType` in GET response |
| `web/components/AddDeviceModal.tsx` | Two-step wizard: type chooser → details |
| `web/components/DeviceCard.tsx` | Show small type icon next to device name |

No new files in Phase 1.

---

## Task 1: Schema — add `deviceType`, `os`, `metadata` columns

**Files:**
- Modify: `web/lib/db/schema.ts`

- [ ] **Step 1: Add the three new columns to `devices`**

Open `web/lib/db/schema.ts`. The current `devices` definition is:

```typescript
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  deviceToken: text('device_token').notNull().unique(),
  status: text('status', { enum: ['online', 'offline'] })
    .notNull()
    .default('offline'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
})
```

Update the import at the top of the file to include `jsonb`:

```typescript
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
```

Replace the `devices` definition with:

```typescript
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  deviceToken: text('device_token').notNull().unique(),
  status: text('status', { enum: ['online', 'offline'] })
    .notNull()
    .default('offline'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

  // Device type taxonomy (Phase 1)
  deviceType: text('device_type', { enum: ['bridged', 'self', 'remote'] })
    .notNull()
    .default('bridged'),
  os: text('os', { enum: ['linux', 'macos', 'windows'] }),
  metadata: jsonb('metadata'),
})
```

`deviceType` defaults to `'bridged'` so all existing rows are tagged correctly. `os` and `metadata` are nullable.

- [ ] **Step 2: Verify the schema TypeScript compiles**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit lib/db/schema.ts 2>&1 | head -20
```

Expected: no new errors specific to `schema.ts`. (Pre-existing errors in `lib/agent.ts` may still appear but are unrelated.)

- [ ] **Step 3: Apply the schema to the database**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npm run db:push
```

This runs `drizzle-kit push`, which detects the new columns and applies them. When prompted, choose "create columns" (it should not require destructive operations since all three new columns have safe defaults / are nullable).

Expected output ends with something like: `Changes applied`.

- [ ] **Step 4: Verify existing Pi continues to work**

```bash
ssh -o StrictHostKeyChecking=no ronnel@pi.local 'sudo journalctl -u guidenco -n 5 --no-pager'
```

Expected: `[ws_client] connected` (or already-connected state). The Pi sends only `device_token` on connect; the new columns don't affect that path.

Then in the dashboard at `http://localhost:3001/dashboard`, the existing Pi device should still show as `online`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/schema.ts
git commit -m "feat(db): add deviceType / os / metadata columns to devices table"
```

---

## Task 2: API — accept `deviceType` + `os` on claim-redeem, return `deviceType` on list

**Files:**
- Modify: `web/app/api/devices/claim-redeem/route.ts`
- Modify: `web/app/api/devices/route.ts`

### Background

`POST /api/devices/claim-redeem` is what the dashboard calls when the user submits the Add Device form. Today it accepts `{ code, name }`. We need to extend it to accept optional `deviceType` (default `'bridged'`) and `os` (only present when `deviceType='self'`).

`GET /api/devices` returns the device list to the dashboard. We need to add `deviceType` to the returned shape so `DeviceCard` can show a type-specific icon.

### Changes

- [ ] **Step 1: Update `claim-redeem` to accept and validate the new fields**

Open `web/app/api/devices/claim-redeem/route.ts`. Find this block:

```typescript
  const body = await req.json().catch(() => null)
  const { code, name } = body ?? {}

  if (!code || !name) {
    return Response.json({ error: 'code and name required' }, { status: 400 })
  }
```

Replace it with:

```typescript
  const body = await req.json().catch(() => null) as
    | { code?: string; name?: string; deviceType?: string; os?: string }
    | null
  const code = body?.code
  const name = body?.name
  const deviceType = (body?.deviceType ?? 'bridged') as 'bridged' | 'self' | 'remote'
  const os = (body?.os ?? null) as 'linux' | 'macos' | 'windows' | null

  if (!code || !name) {
    return Response.json({ error: 'code and name required' }, { status: 400 })
  }

  if (!['bridged', 'self', 'remote'].includes(deviceType)) {
    return Response.json({ error: 'Invalid deviceType' }, { status: 400 })
  }

  if (os !== null && !['linux', 'macos', 'windows'].includes(os)) {
    return Response.json({ error: 'Invalid os' }, { status: 400 })
  }

  if (deviceType === 'self' && os === null) {
    return Response.json({ error: 'os required when deviceType is self' }, { status: 400 })
  }

  if (deviceType === 'remote') {
    return Response.json({ error: 'Remote devices are not yet supported' }, { status: 400 })
  }
```

The final block explicitly rejects `remote` claims because Remote provisioning (the e2b sandbox lifecycle) lands in Phase 3.

Then find the `db.insert(devices).values(...)` call:

```typescript
  await db.insert(devices).values({
    id: claim.deviceId,
    userId: session.user.id,
    name,
    deviceToken,
    status: 'offline',
  })
```

Replace with:

```typescript
  await db.insert(devices).values({
    id: claim.deviceId,
    userId: session.user.id,
    name,
    deviceToken,
    status: 'offline',
    deviceType,
    os,
  })
```

(`metadata` stays at its DB default of `NULL` for Bridged + Self.)

- [ ] **Step 2: Update `GET /api/devices` to include `deviceType`**

Open `web/app/api/devices/route.ts`. Find the select inside the GET handler:

```typescript
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      status: devices.status,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(eq(devices.userId, session.user.id))
```

Replace with:

```typescript
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      status: devices.status,
      lastSeenAt: devices.lastSeenAt,
      deviceType: devices.deviceType,
    })
    .from(devices)
    .where(eq(devices.userId, session.user.id))
```

- [ ] **Step 3: Verify TypeScript builds cleanly**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -20
```

Expected: no errors outside of the pre-existing `lib/agent.ts` errors.

- [ ] **Step 4: Smoke test the existing Bridged flow still works**

With the dev server running (`npm run dev`), open the dashboard. The existing Pi should appear in the device list. Open it — video should still load. (No new code path has been activated yet; this only verifies the schema/API change didn't break anything.)

- [ ] **Step 5: Commit**

```bash
git add web/app/api/devices/claim-redeem/route.ts web/app/api/devices/route.ts
git commit -m "feat(api): accept deviceType + os on claim-redeem; return deviceType on list"
```

---

## Task 3: AddDeviceModal — two-step wizard

**Files:**
- Modify: `web/components/AddDeviceModal.tsx`

### Background

The modal today is a single screen: name + pairing-code form. We rebuild it as a two-step wizard. Step 1 shows three type cards; Step 2 shows the type-specific form. In Phase 1 only Bridged advances to a working Step 2 — Self and Remote cards are disabled with a "Coming soon" label.

### Changes

- [ ] **Step 1: Rewrite the modal with a two-step wizard**

Replace the entire contents of `web/components/AddDeviceModal.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { Cpu, Monitor, Cloud } from 'lucide-react'

interface Props {
  onClose: () => void
  onAdded: () => void
}

type DeviceType = 'bridged' | 'self' | 'remote'

interface TypeOption {
  id: DeviceType
  label: string
  description: string
  icon: React.ReactNode
  available: boolean
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    id: 'bridged',
    label: 'Bridged',
    description: 'Control another computer via a Raspberry Pi (HDMI + USB-HID).',
    icon: <Cpu size={20} />,
    available: true,
  },
  {
    id: 'self',
    label: 'Self',
    description: 'Control this computer directly with a small background client.',
    icon: <Monitor size={20} />,
    available: false,
  },
  {
    id: 'remote',
    label: 'Remote',
    description: 'Spin up a cloud Linux desktop sandbox managed by Guidenco.',
    icon: <Cloud size={20} />,
    available: false,
  },
]

export function AddDeviceModal({ onClose, onAdded }: Props) {
  const [type, setType] = useState<DeviceType | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!type) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/devices/claim-redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        deviceType: type,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to add device')
      setLoading(false)
      return
    }

    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {type ? 'Pair device' : 'Add device'}
          </h2>
          {type && (
            <button
              type="button"
              onClick={() => { setType(null); setError('') }}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              ← Change type
            </button>
          )}
        </div>

        {type === null && (
          <div className="space-y-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={!opt.available}
                onClick={() => opt.available && setType(opt.id)}
                className={`w-full text-left rounded border p-3 flex items-start gap-3 transition-colors ${
                  opt.available
                    ? 'border-zinc-700 hover:border-zinc-500 cursor-pointer'
                    : 'border-zinc-800 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="text-zinc-300 mt-0.5">{opt.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {!opt.available && (
                      <span className="text-[10px] uppercase tracking-wide bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-zinc-400 mt-1">{opt.description}</span>
                </span>
              </button>
            ))}
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded border border-zinc-700 py-2 text-sm hover:border-zinc-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {type === 'bridged' && (
          <>
            <p className="text-sm text-zinc-400">
              Run the install script on your Raspberry Pi, then enter the code it prints.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Device name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Pi"
                  required
                  className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Pairing code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC-123"
                  required
                  maxLength={7}
                  className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-zinc-500"
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
                  disabled={loading}
                  className="flex-1 rounded bg-zinc-100 text-zinc-900 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
                >
                  {loading ? 'Linking…' : 'Link Device'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
```

The only thing on the wire that's different from before is the extra `deviceType: type` field in the POST body. The pairing form for Bridged is otherwise byte-for-byte the same as the current implementation, so a user pairing a Pi today will see the same UI flow plus one extra step at the start.

- [ ] **Step 2: Verify TypeScript builds**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -20
```

Expected: no errors outside of the pre-existing `lib/agent.ts` errors.

- [ ] **Step 3: Manually test the new wizard**

With the dev server running, open the dashboard and click **+ Add Device**. Verify:

1. Three cards are shown: Bridged (enabled), Self (Coming soon, disabled), Remote (Coming soon, disabled).
2. Clicking Bridged advances to the existing name + pairing-code form.
3. The "← Change type" link returns to the chooser.
4. Submitting with a valid existing pairing code links the device successfully and adds it to the dashboard list.

- [ ] **Step 4: Commit**

```bash
git add web/components/AddDeviceModal.tsx
git commit -m "feat(ui): two-step Add Device wizard with type chooser (only Bridged enabled)"
```

---

## Task 4: DeviceCard — show small type icon

**Files:**
- Modify: `web/components/DeviceCard.tsx`

### Background

Now that the device list returns `deviceType`, we show a tiny icon next to the device name so users can tell their device types apart at a glance.

### Changes

- [ ] **Step 1: Add `deviceType` to the `Device` interface and render an icon**

Open `web/components/DeviceCard.tsx`. Find the `Device` interface near the top:

```tsx
interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}
```

Replace with:

```tsx
import { Cpu, Monitor, Cloud } from 'lucide-react'

interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
  deviceType: 'bridged' | 'self' | 'remote'
}

const TYPE_ICON: Record<Device['deviceType'], React.ReactNode> = {
  bridged: <Cpu size={12} />,
  self:    <Monitor size={12} />,
  remote:  <Cloud size={12} />,
}
```

Place the `import` on its own line near the existing imports at the top of the file (after `import Link from 'next/link'`).

Then find the device name rendering inside the card body:

```tsx
      <div className="p-3">
        <div className="font-medium text-sm">{device.name}</div>
```

Replace with:

```tsx
      <div className="p-3">
        <div className="font-medium text-sm flex items-center gap-1.5">
          <span className="text-zinc-500">{TYPE_ICON[device.deviceType]}</span>
          {device.name}
        </div>
```

- [ ] **Step 2: Update the parent `Device` type in the dashboard**

Open `web/app/dashboard/page.tsx`. Find the existing `Device` interface:

```tsx
interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}
```

Replace with:

```tsx
interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
  deviceType: 'bridged' | 'self' | 'remote'
}
```

- [ ] **Step 3: Verify TypeScript builds**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -20
```

Expected: no errors outside of `lib/agent.ts`.

- [ ] **Step 4: Manually verify the icon shows**

With the dev server running, open the dashboard. The existing Pi should display a small CPU icon next to its name (since it defaulted to `deviceType='bridged'`).

- [ ] **Step 5: Commit**

```bash
git add web/components/DeviceCard.tsx web/app/dashboard/page.tsx
git commit -m "feat(ui): show device-type icon on device card"
```

---

## Manual Verification (after all four tasks)

1. Dashboard loads, existing Pi shows with a CPU icon and `online` status.
2. Clicking + Add Device opens the wizard with three cards.
3. Self and Remote are visibly disabled with "Coming soon" labels.
4. Bridged advances to the name + pairing-code form; pairing still works exactly as before.
5. `psql` check (optional): `SELECT id, name, device_type, os FROM devices;` shows existing rows with `device_type = 'bridged'`, `os = NULL`.

---

## Out of Scope (Phases 2 & 3)

- `guidenco_client` Python package (Phase 2)
- Install endpoints `/install/self/{os}` (Phase 2)
- OS chooser for Self (Phase 2)
- `web/lib/sandbox.ts` and e2b provisioning (Phase 3)
- Auto-termination of idle Remote sandboxes (Phase 3)
- Removing the "Coming soon" disable on Self / Remote cards (Phase 2 + 3 respectively)
