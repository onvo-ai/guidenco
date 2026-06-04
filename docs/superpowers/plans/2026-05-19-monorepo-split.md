# Guidenco Monorepo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Guidenco project into a monorepo with `web/` (Next.js multi-device dashboard), `service/` (Pi agent, relocated), and `skill/` packages, adding Better Auth, PostgreSQL, MinIO, a WebSocket relay, and a curl install script.

**Architecture:** The hosted Next.js web app becomes the central control plane — users register Pi devices via a one-time pairing code, and the Pi maintains a persistent WebSocket to the web app that tunnels video frames and agent events to any connected browser. The existing Flask server on the Pi continues to own all hardware interaction; a new `ws_client.py` bridges it to the cloud.

**Tech Stack:** Next.js 15 (App Router), Better Auth, Drizzle ORM, PostgreSQL, MinIO, `ws` (WebSocket server), `websockets` (Python client), Vitest, Python unittest

---

## File Map

### New files — web/
| File | Responsibility |
|------|---------------|
| `web/package.json` | Next.js workspace dependencies |
| `web/tsconfig.json` | TypeScript config |
| `web/next.config.ts` | Next.js config (transpile, etc.) |
| `web/server.ts` | Custom HTTP server wrapping Next.js + WebSocket upgrade handler |
| `web/docker-compose.yml` | PostgreSQL + MinIO for local dev |
| `web/.env.local.example` | Env var documentation |
| `web/drizzle.config.ts` | Drizzle ORM config pointing to schema |
| `web/lib/db/schema.ts` | All table definitions (Better Auth tables + devices, device_claims, agent_jobs, screenshots) |
| `web/lib/db/client.ts` | Singleton Drizzle db client |
| `web/lib/auth.ts` | Better Auth instance + session helpers |
| `web/lib/minio.ts` | MinIO client singleton + bucket-init helper |
| `web/lib/relay.ts` | In-memory Pi WebSocket connection registry + browser listener map |
| `web/lib/utils.ts` | `generateCode()` + `generateDeviceToken()` pure helpers |
| `web/app/layout.tsx` | Root layout |
| `web/app/page.tsx` | Redirect to `/dashboard` or `/sign-in` |
| `web/app/(auth)/sign-in/page.tsx` | Sign-in form |
| `web/app/(auth)/sign-up/page.tsx` | Sign-up form |
| `web/app/dashboard/page.tsx` | Device list + Add Device modal |
| `web/app/dashboard/[deviceId]/page.tsx` | Per-device viewer + command input |
| `web/app/api/auth/[...all]/route.ts` | Better Auth catch-all |
| `web/app/api/devices/claim-init/route.ts` | Pi calls to start pairing (unauthenticated) |
| `web/app/api/devices/claim-status/route.ts` | Pi polls for its token (unauthenticated) |
| `web/app/api/devices/claim-redeem/route.ts` | User redeems code to link device (authenticated) |
| `web/app/api/devices/route.ts` | GET list of user's devices |
| `web/app/api/devices/[id]/route.ts` | PATCH name / DELETE device |
| `web/app/api/relay/[deviceId]/stream/route.ts` | Browser SSE — forwards Pi events |
| `web/app/api/relay/[deviceId]/command/route.ts` | Browser POST goal → forwarded to Pi |
| `web/app/api/health/route.ts` | `GET /api/health` → 200 (used by install script preflight) |
| `web/components/DeviceCard.tsx` | Device list item with status badge |
| `web/components/AddDeviceModal.tsx` | Code entry modal |
| `web/components/DeviceViewer.tsx` | Video frame display + chat input |

### Moved files — service/
All current root-level Python files move into `service/`. The `frontend/` folder is deleted.

| From | To |
|------|-----|
| `agent/` | `service/agent/` |
| `server/` | `service/server/` |
| `tools/` | `service/tools/` |
| `config.py` | `service/config.py` |
| `server.py` | `service/server.py` |
| `utils.py` | `service/utils.py` |
| `settings_store.py` | `service/settings_store.py` |
| `settings.json` | `service/settings.json` |
| `requirements.txt` | `service/requirements.txt` |
| `merge_settings.py` | `service/merge_settings.py` |
| `guidenco.service` | `service/guidenco.service` |
| `setup_hid_gadget.sh` | `service/setup_hid_gadget.sh` |
| `cloudflared-setup.sh` | `service/cloudflared-setup.sh` |
| `deploy.sh` | `service/deploy.sh` |
| `ansible/` | `service/ansible/` |

### New / modified files — service/
| File | Change |
|------|--------|
| `service/config.py` | Add `DEVICE_ID`, `DEVICE_TOKEN`, `CLOUD_URL` from env |
| `service/ws_client.py` | New: asyncio WebSocket relay client |
| `service/server.py` | Add `start_ws_client()` call in `_post_fork` |
| `service/guidenco.service` | Update paths to `/opt/guidenco`, add `EnvironmentFile` |
| `service/requirements.txt` | Add `websockets` |
| `service/install.sh` | New: curl-installable setup script |

### Moved files — skill/
| From | To |
|------|-----|
| `.claude/skills/remote-control/` | `skill/guidenco-remote-control/` |

---

## Task 1: Monorepo Scaffold — move service files

**Files:**
- Create: `service/` (move all root Python dirs/files into it)
- Delete: `frontend/`
- Create: `package.json` (workspace root)

- [ ] **Step 1: Move Python files into service/**

```bash
mkdir -p service
git mv agent service/agent
git mv server service/server
git mv tools service/tools
git mv config.py service/config.py
git mv server.py service/server.py
git mv utils.py service/utils.py
git mv settings_store.py service/settings_store.py
git mv settings.json service/settings.json
git mv requirements.txt service/requirements.txt
git mv merge_settings.py service/merge_settings.py
git mv guidenco.service service/guidenco.service
git mv setup_hid_gadget.sh service/setup_hid_gadget.sh
git mv cloudflared-setup.sh service/cloudflared-setup.sh
git mv deploy.sh service/deploy.sh
git mv ansible service/ansible
```

- [ ] **Step 2: Remove frontend/ (replaced by web/)**

```bash
git rm -rf frontend/
```

- [ ] **Step 3: Create workspace root package.json**

Create `package.json`:
```json
{
  "name": "guidenco",
  "private": true,
  "workspaces": [
    "web"
  ]
}
```

- [ ] **Step 4: Verify Python imports still work by checking relative imports in moved files**

```bash
grep -r "from config import\|import config\|from server import\|from agent import\|from tools import\|from utils import\|from settings_store import" service/ --include="*.py" | head -30
```

All paths should be relative within `service/`. If any absolute-path `sys.path.insert` remains pointing at the old root, update it to point at `service/`'s own root.

- [ ] **Step 5: Check sys.path inserts in moved files**

```bash
grep -rn "sys.path.insert" service/ --include="*.py"
```

Any line like `sys.path.insert(0, "/home/ronnel/Desktop/guidenco")` must be removed or updated. Most files use `os.path.dirname(os.path.abspath(__file__))` which is relative — those are fine.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move Python service into service/, remove frontend/"
```

---

## Task 2: Move Skill

**Files:**
- Move: `.claude/skills/remote-control/` → `skill/guidenco-remote-control/`
- Modify: `skill/guidenco-remote-control/skill.md`

- [ ] **Step 1: Move skill directory**

```bash
mkdir -p skill
cp -r .claude/skills/remote-control skill/guidenco-remote-control
git rm -rf .claude/skills/remote-control
git add skill/
```

- [ ] **Step 2: Update the skill API base URL**

In `skill/guidenco-remote-control/skill.md`, replace the old per-Pi tunnel URL with the cloud URL. Find the line containing the base URL and update it:

```bash
grep -n "https://" skill/guidenco-remote-control/skill.md
```

Open the file and replace every occurrence of `https://bot.ronnel.cloud` with `https://openclaw.ai`.

- [ ] **Step 3: Commit**

```bash
git add skill/ .claude/
git commit -m "refactor: move skill to skill/guidenco-remote-control/"
```

---

## Task 3: Next.js App Scaffold

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`
- Create: `web/.env.local.example`

- [ ] **Step 1: Scaffold the Next.js app**

```bash
cd web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*" --no-git
```

When prompted, accept the defaults. This creates a baseline Next.js 15 app in `web/`.

- [ ] **Step 2: Install additional dependencies**

```bash
cd web
npm install better-auth drizzle-orm pg minio ws
npm install -D drizzle-kit @types/pg @types/ws tsx vitest @vitejs/plugin-react
```

- [ ] **Step 3: Replace web/package.json scripts section**

In `web/package.json`, update `"scripts"` to:
```json
"scripts": {
  "dev": "tsx server.ts",
  "build": "next build",
  "start": "NODE_ENV=production tsx server.ts",
  "lint": "next lint",
  "test": "vitest run",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio"
}
```

- [ ] **Step 4: Create web/.env.local.example**

Create `web/.env.local.example`:
```bash
# PostgreSQL (Docker Compose default)
DATABASE_URL=postgresql://guidenco:guidenco@localhost:5432/guidenco

# MinIO (Docker Compose default)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=guidenco
MINIO_SECRET_KEY=guidenco123
MINIO_BUCKET=guidenco

# Better Auth — generate with: openssl rand -hex 32
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:3000
```

- [ ] **Step 5: Copy to .env.local**

```bash
cp web/.env.local.example web/.env.local
```

Edit `web/.env.local` and set `BETTER_AUTH_SECRET` to a real random value:

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" >> web/.env.local
```

- [ ] **Step 6: Create web/next.config.ts**

Create `web/next.config.ts`:
```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add web/
git commit -m "feat(web): scaffold Next.js app"
```

---

## Task 4: Docker Compose (PostgreSQL + MinIO)

**Files:**
- Create: `web/docker-compose.yml`

- [ ] **Step 1: Create web/docker-compose.yml**

Create `web/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: guidenco
      POSTGRES_PASSWORD: guidenco
      POSTGRES_DB: guidenco
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: guidenco
      MINIO_ROOT_PASSWORD: guidenco123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

- [ ] **Step 2: Start services**

```bash
cd web
docker compose up -d
```

- [ ] **Step 3: Verify both services are healthy**

```bash
# PostgreSQL
docker compose exec postgres pg_isready -U guidenco
# Expected: /var/run/postgresql:5432 - accepting connections

# MinIO
curl -s http://localhost:9000/minio/health/live
# Expected: HTTP 200
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/docker-compose.yml
git commit -m "feat(web): add Docker Compose for PostgreSQL and MinIO"
```

---

## Task 5: Database Schema + Drizzle Client

**Files:**
- Create: `web/lib/db/schema.ts`
- Create: `web/lib/db/client.ts`
- Create: `web/drizzle.config.ts`
- Create: `web/lib/utils.ts`
- Create: `web/lib/utils.test.ts`

- [ ] **Step 1: Write failing tests for utils**

Create `web/lib/utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generateCode, generateDeviceToken } from './utils'

describe('generateCode', () => {
  it('produces ABC-123 format (3 chars, dash, 3 chars, uppercase alphanum)', () => {
    const code = generateCode()
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)
  })

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 200 }, generateCode))
    expect(codes.size).toBeGreaterThan(180)
  })
})

describe('generateDeviceToken', () => {
  it('starts with dt_ prefix', () => {
    expect(generateDeviceToken()).toMatch(/^dt_/)
  })

  it('has at least 32 chars after prefix', () => {
    const token = generateDeviceToken()
    expect(token.slice(3).length).toBeGreaterThanOrEqual(32)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateDeviceToken))
    expect(tokens.size).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd web && npx vitest run lib/utils.test.ts
```

Expected: `Cannot find module './utils'`

- [ ] **Step 3: Implement web/lib/utils.ts**

Create `web/lib/utils.ts`:
```typescript
import { randomBytes } from 'crypto'

const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateCode(): string {
  const bytes = randomBytes(6)
  const chars = Array.from(bytes, (b) => ALPHANUM[b % ALPHANUM.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3, 6).join('')}`
}

export function generateDeviceToken(): string {
  return `dt_${randomBytes(24).toString('hex')}`
}
```

- [ ] **Step 4: Run tests — expect passing**

```bash
cd web && npx vitest run lib/utils.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Create web/lib/db/schema.ts**

Create `web/lib/db/schema.ts`:
```typescript
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ── Better Auth tables ────────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().$defaultFn(() => false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()),
})

// ── App tables ────────────────────────────────────────────────────────────────

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

export const deviceClaims = pgTable('device_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').notNull(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
})

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  goal: text('goal').notNull(),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed'] })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export const screenshots = pgTable('screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => agentJobs.id, { onDelete: 'set null' }),
  minioKey: text('minio_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 6: Create web/lib/db/client.ts**

Create `web/lib/db/client.ts`:
```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle(pool, { schema })
```

- [ ] **Step 7: Create web/drizzle.config.ts**

Create `web/drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

- [ ] **Step 8: Push schema to database**

```bash
cd web && npm run db:push
```

Expected output: list of created tables with no errors.

- [ ] **Step 9: Commit**

```bash
cd ..
git add web/lib/ web/drizzle.config.ts
git commit -m "feat(web): add Drizzle schema, db client, and utils"
```

---

## Task 6: Better Auth Setup

**Files:**
- Create: `web/lib/auth.ts`
- Create: `web/app/api/auth/[...all]/route.ts`
- Create: `web/app/api/health/route.ts`

- [ ] **Step 1: Create web/lib/auth.ts**

Create `web/lib/auth.ts`:
```typescript
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from './db/client'
import * as schema from './db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers })
}
```

- [ ] **Step 2: Create web/app/api/auth/[...all]/route.ts**

Create `web/app/api/auth/[...all]/route.ts`:
```typescript
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 3: Create web/app/api/health/route.ts**

Create `web/app/api/health/route.ts`:
```typescript
export function GET() {
  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Verify auth endpoints respond**

Start the dev server in one terminal:
```bash
cd web && npm run dev
```

In another terminal:
```bash
curl -s http://localhost:3000/api/health
# Expected: {"ok":true}

curl -s http://localhost:3000/api/auth/get-session
# Expected: null or empty session JSON — no 500 error
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/lib/auth.ts web/app/api/
git commit -m "feat(web): add Better Auth and health route"
```

---

## Task 7: MinIO Client

**Files:**
- Create: `web/lib/minio.ts`

- [ ] **Step 1: Create web/lib/minio.ts**

Create `web/lib/minio.ts`:
```typescript
import { Client } from 'minio'

const BUCKET = process.env.MINIO_BUCKET ?? 'guidenco'

export const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
})

export async function ensureBucket(): Promise<void> {
  const exists = await minio.bucketExists(BUCKET)
  if (!exists) {
    await minio.makeBucket(BUCKET)
  }
}

export function screenshotKey(deviceId: string, jobId: string | null, ts: Date): string {
  const prefix = jobId ? `${deviceId}/${jobId}` : `${deviceId}/manual`
  return `${prefix}/${ts.getTime()}.jpg`
}

export async function presignedUrl(key: string, expirySeconds = 3600): Promise<string> {
  return minio.presignedGetObject(BUCKET, key, expirySeconds)
}

export { BUCKET }
```

- [ ] **Step 2: Verify MinIO bucket creation**

```bash
cd web
node -e "
const { minio, ensureBucket } = require('./lib/minio.ts')
ensureBucket().then(() => { console.log('bucket ok'); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })
"
```

Or use tsx:
```bash
cd web && npx tsx -e "import { ensureBucket } from './lib/minio.ts'; ensureBucket().then(() => { console.log('bucket ok'); process.exit(0) })"
```

Expected: `bucket ok`

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/lib/minio.ts
git commit -m "feat(web): add MinIO client with bucket init"
```

---

## Task 8: Custom Server + WebSocket Upgrade Handler

**Files:**
- Create: `web/server.ts`
- Create: `web/lib/relay.ts`

- [ ] **Step 1: Create web/lib/relay.ts**

Create `web/lib/relay.ts`:
```typescript
import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { db } from './db/client'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'

// Active Pi connections: deviceId → WebSocket
const connections = new Map<string, WebSocket>()

// Browser SSE listeners: deviceId → Set of callbacks
const listeners = new Map<string, Set<(data: string) => void>>()

export async function handleRelayUpgrade(ws: WebSocket, req: IncomingMessage) {
  const rawUrl = req.url ?? '/'
  const url = new URL(rawUrl, 'http://localhost')
  const token = url.searchParams.get('device_token')

  if (!token) {
    ws.close(4001, 'Missing device_token')
    return
  }

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.deviceToken, token))
    .limit(1)

  if (!device) {
    ws.close(4001, 'Invalid device_token')
    return
  }

  await db
    .update(devices)
    .set({ status: 'online', lastSeenAt: new Date() })
    .where(eq(devices.id, device.id))

  connections.set(device.id, ws)

  ws.on('message', (data) => {
    const raw = data.toString()
    const deviceListeners = listeners.get(device.id)
    deviceListeners?.forEach((cb) => cb(raw))
  })

  ws.on('close', async () => {
    connections.delete(device.id)
    await db
      .update(devices)
      .set({ status: 'offline' })
      .where(eq(devices.id, device.id))
  })

  ws.on('error', (err) => {
    console.error(`[relay] Pi WS error (${device.id}):`, err.message)
  })
}

export function sendToDevice(deviceId: string, message: string): boolean {
  const ws = connections.get(deviceId)
  if (!ws || ws.readyState !== 1 /* OPEN */) return false
  ws.send(message)
  return true
}

export function addBrowserListener(
  deviceId: string,
  cb: (data: string) => void
): () => void {
  if (!listeners.has(deviceId)) listeners.set(deviceId, new Set())
  listeners.get(deviceId)!.add(cb)
  return () => listeners.get(deviceId)?.delete(cb)
}

export function isDeviceOnline(deviceId: string): boolean {
  const ws = connections.get(deviceId)
  return ws !== undefined && ws.readyState === 1
}
```

- [ ] **Step 2: Create web/server.ts**

Create `web/server.ts`:
```typescript
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleRelayUpgrade } from './lib/relay'
import { ensureBucket } from './lib/minio'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  await ensureBucket()

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/', true)
    if (pathname === '/relay/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleRelayUpgrade(ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
```

- [ ] **Step 3: Verify the server starts and the health endpoint responds**

```bash
cd web && npm run dev
```

Expected: `> Ready on http://localhost:3000`

```bash
curl -s http://localhost:3000/api/health
# Expected: {"ok":true}
```

- [ ] **Step 4: Verify WebSocket upgrade is handled**

```bash
# In a second terminal (requires wscat: npm install -g wscat)
wscat -c "ws://localhost:3000/relay/ws?device_token=invalid"
# Expected: Connection closed with code 4001 and reason "Invalid device_token"
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/server.ts web/lib/relay.ts
git commit -m "feat(web): add custom server with WebSocket relay handler"
```

---

## Task 9: Device Claim API Routes

**Files:**
- Create: `web/app/api/devices/claim-init/route.ts`
- Create: `web/app/api/devices/claim-status/route.ts`
- Create: `web/app/api/devices/claim-redeem/route.ts`

- [ ] **Step 1: Create claim-init route**

Create `web/app/api/devices/claim-init/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { deviceClaims } from '@/lib/db/schema'
import { generateCode } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const deviceId = body?.device_id

  if (!deviceId || typeof deviceId !== 'string') {
    return Response.json({ error: 'device_id required' }, { status: 400 })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  await db.insert(deviceClaims).values({ deviceId, code, expiresAt })

  return Response.json({ code })
}
```

- [ ] **Step 2: Create claim-status route**

Create `web/app/api/devices/claim-status/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { deviceClaims, devices } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id')

  if (!deviceId) {
    return Response.json({ error: 'device_id required' }, { status: 400 })
  }

  // Find the most recent claim for this device_id
  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(eq(deviceClaims.deviceId, deviceId))
    .orderBy(deviceClaims.expiresAt)
    .limit(1)

  if (!claim) {
    return Response.json({ status: 'not_found' }, { status: 404 })
  }

  if (new Date() > claim.expiresAt && !claim.claimedAt) {
    return Response.json({ status: 'expired' })
  }

  if (!claim.claimedAt) {
    return Response.json({ status: 'pending' })
  }

  // Claimed — find the device token
  const [device] = await db
    .select({ deviceToken: devices.deviceToken })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)

  if (!device) {
    return Response.json({ status: 'pending' })
  }

  return Response.json({ status: 'claimed', device_token: device.deviceToken })
}
```

- [ ] **Step 3: Create claim-redeem route (authenticated — user links the device)**

Create `web/app/api/devices/claim-redeem/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { deviceClaims, devices } from '@/lib/db/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { generateDeviceToken } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { code, name } = body ?? {}

  if (!code || !name) {
    return Response.json({ error: 'code and name required' }, { status: 400 })
  }

  // Find a valid, unclaimed claim with this code
  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(
      and(
        eq(deviceClaims.code, code.toUpperCase()),
        isNull(deviceClaims.claimedAt),
        gt(deviceClaims.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!claim) {
    return Response.json({ error: 'Invalid or expired code' }, { status: 400 })
  }

  const deviceToken = generateDeviceToken()

  // Create the device record — use the claim's deviceId as the devices.id
  // so claim-status can look it up directly
  await db.insert(devices).values({
    id: claim.deviceId,
    userId: session.user.id,
    name,
    deviceToken,
    status: 'offline',
  })

  // Mark claim as redeemed
  await db
    .update(deviceClaims)
    .set({ claimedAt: new Date() })
    .where(eq(deviceClaims.id, claim.id))

  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Smoke-test claim flow**

Start the dev server (`npm run dev` in `web/`), then:

```bash
# Step A: Pi calls claim-init
curl -s -X POST http://localhost:3000/api/devices/claim-init \
  -H "Content-Type: application/json" \
  -d '{"device_id":"11111111-1111-1111-1111-111111111111"}'
# Expected: {"code":"ABC-123"} (some 6-char code)

# Step B: Pi polls claim-status (should be pending)
curl -s "http://localhost:3000/api/devices/claim-status?device_id=11111111-1111-1111-1111-111111111111"
# Expected: {"status":"pending"}
```

The full redemption flow requires an authenticated user session, which will be tested in Task 14 after the UI is built.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/app/api/devices/
git commit -m "feat(web): add device claim-init, claim-status, and claim-redeem API routes"
```

---

## Task 10: Device Management API

**Files:**
- Create: `web/app/api/devices/route.ts`
- Create: `web/app/api/devices/[id]/route.ts`

- [ ] **Step 1: Create web/app/api/devices/route.ts (list user's devices)**

Create `web/app/api/devices/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { isDeviceOnline } from '@/lib/relay'

export async function GET(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      status: devices.status,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(eq(devices.userId, session.user.id))

  // Reflect live relay status
  const result = rows.map((d) => ({
    ...d,
    status: isDeviceOnline(d.id) ? 'online' : 'offline',
  }))

  return Response.json(result)
}
```

- [ ] **Step 2: Create web/app/api/devices/[id]/route.ts**

Create `web/app/api/devices/[id]/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const { name } = body ?? {}

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name required' }, { status: 400 })
  }

  const [updated] = await db
    .update(devices)
    .set({ name })
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id, name: devices.name })

  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [deleted] = await db
    .delete(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/devices/
git commit -m "feat(web): add device list and CRUD API routes"
```

---

## Task 11: Relay Stream + Command API Routes

**Files:**
- Create: `web/app/api/relay/[deviceId]/stream/route.ts`
- Create: `web/app/api/relay/[deviceId]/command/route.ts`

- [ ] **Step 1: Create stream route (browser SSE)**

Create `web/app/api/relay/[deviceId]/stream/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { addBrowserListener } from '@/lib/relay'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { deviceId } = await params

  // Verify device belongs to this user
  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) return Response.json({ error: 'Not found' }, { status: 404 })

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // client disconnected
        }
      }

      const remove = addBrowserListener(deviceId, (raw) => send(raw))

      req.signal.addEventListener('abort', () => {
        remove()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Create command route (browser → Pi)**

Create `web/app/api/relay/[deviceId]/command/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendToDevice } from '@/lib/relay'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function POST(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { deviceId } = await params

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const { goal, instructions } = body ?? {}

  if (!goal) return Response.json({ error: 'goal required' }, { status: 400 })

  const sent = sendToDevice(
    deviceId,
    JSON.stringify({ type: 'command', goal, instructions: instructions ?? '' })
  )

  if (!sent) {
    return Response.json({ error: 'Device offline' }, { status: 503 })
  }

  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/api/relay/
git commit -m "feat(web): add relay stream (SSE) and command (POST) API routes"
```

---

## Task 12: Auth Pages

**Files:**
- Modify: `web/app/layout.tsx`
- Modify: `web/app/page.tsx`
- Create: `web/app/(auth)/sign-in/page.tsx`
- Create: `web/app/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Update web/app/layout.tsx**

Replace the contents of `web/app/layout.tsx`:
```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Guidenco',
  description: 'Vision-driven remote desktop automation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Update web/app/page.tsx (root redirect)**

Replace `web/app/page.tsx`:
```typescript
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/auth'

export default async function RootPage() {
  const session = await getSession(await headers())
  if (session) redirect('/dashboard')
  redirect('/sign-in')
}
```

- [ ] **Step 3: Create sign-in page**

Create `web/app/(auth)/sign-in/page.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import Link from 'next/link'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await authClient.signIn.email({ email, password })
    if (error) {
      setError(error.message ?? 'Sign in failed')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-bold">Sign in to Guidenco</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-zinc-100 text-zinc-900 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-sm text-zinc-500 text-center">
          No account?{' '}
          <Link href="/sign-up" className="text-zinc-300 hover:text-white">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create auth-client.ts (client-side Better Auth instance)**

Create `web/lib/auth-client.ts`:
```typescript
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
```

Add to `web/.env.local`:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Also add to `web/.env.local.example`:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Create sign-up page**

Create `web/app/(auth)/sign-up/page.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import Link from 'next/link'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await authClient.signUp.email({ name, email, password })
    if (error) {
      setError(error.message ?? 'Sign up failed')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-zinc-100 text-zinc-900 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-zinc-500 text-center">
          Have an account?{' '}
          <Link href="/sign-in" className="text-zinc-300 hover:text-white">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify auth flow in browser**

Navigate to `http://localhost:3000`. Expect redirect to `/sign-in`.

Create an account via the sign-up form. Expect redirect to `/dashboard` (404 until Task 13). Check that the network tab shows `POST /api/auth/sign-up` returning 200.

- [ ] **Step 7: Commit**

```bash
git add web/app/ web/lib/auth-client.ts
git commit -m "feat(web): add sign-in and sign-up pages with Better Auth client"
```

---

## Task 13: Dashboard — Device List + Add Device Modal

**Files:**
- Create: `web/components/DeviceCard.tsx`
- Create: `web/components/AddDeviceModal.tsx`
- Create: `web/app/dashboard/page.tsx`

- [ ] **Step 1: Create DeviceCard component**

Create `web/components/DeviceCard.tsx`:
```typescript
import Link from 'next/link'

interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

export function DeviceCard({ device }: { device: Device }) {
  return (
    <Link
      href={`/dashboard/${device.id}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{device.name}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            device.status === 'online'
              ? 'bg-green-900/50 text-green-400'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {device.status}
        </span>
      </div>
      {device.lastSeenAt && (
        <p className="text-xs text-zinc-600">
          Last seen {new Date(device.lastSeenAt).toLocaleString()}
        </p>
      )}
    </Link>
  )
}
```

- [ ] **Step 2: Create AddDeviceModal component**

Create `web/components/AddDeviceModal.tsx`:
```typescript
'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onAdded: () => void
}

export function AddDeviceModal({ onClose, onAdded }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/devices/claim-redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }),
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">Add Device</h2>
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
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard page**

Create `web/app/dashboard/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeviceCard } from '@/components/DeviceCard'
import { AddDeviceModal } from '@/components/AddDeviceModal'
import { authClient } from '@/lib/auth-client'

interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function fetchDevices() {
    const res = await fetch('/api/devices')
    if (res.status === 401) {
      router.push('/sign-in')
      return
    }
    const data = await res.json()
    setDevices(data)
    setLoading(false)
  }

  useEffect(() => { fetchDevices() }, [])

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/sign-in')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Devices</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="rounded bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            + Add Device
          </button>
          <button
            onClick={handleSignOut}
            className="rounded border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Sign out
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : devices.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg mb-2">No devices yet</p>
          <p className="text-sm">Add your first Raspberry Pi to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
        </div>
      )}

      {showModal && (
        <AddDeviceModal
          onClose={() => setShowModal(false)}
          onAdded={fetchDevices}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify dashboard in browser**

Navigate to `http://localhost:3000/dashboard` while signed in. Expect:
- "Devices" heading, "+ Add Device" button, "No devices yet" message
- Clicking "+ Add Device" opens the modal with code and name fields
- Entering an invalid code shows an error

- [ ] **Step 5: Commit**

```bash
git add web/components/ web/app/dashboard/page.tsx
git commit -m "feat(web): add dashboard device list and Add Device modal"
```

---

## Task 14: Per-Device Viewer Page

**Files:**
- Create: `web/components/DeviceViewer.tsx`
- Create: `web/app/dashboard/[deviceId]/page.tsx`

- [ ] **Step 1: Create DeviceViewer component**

Create `web/components/DeviceViewer.tsx`:
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  deviceId: string
}

interface Event {
  type: string
  message?: string
  payload?: Record<string, unknown>
  goal?: string
}

export function DeviceViewer({ deviceId }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [goal, setGoal] = useState('')
  const [sending, setSending] = useState(false)
  const [offline, setOffline] = useState(false)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const es = new EventSource(`/api/relay/${deviceId}/stream`)

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data)

        if (parsed.type === 'frame') {
          setImgSrc(`data:image/jpeg;base64,${parsed.data}`)
          setOffline(false)
          return
        }

        if (parsed.type === 'event') {
          // The Pi forwards raw SSE strings: "data: {...}\n\n"
          const inner = parsed.data?.replace(/^data: /, '').trim()
          if (inner) {
            try {
              const evt = JSON.parse(inner)
              setEvents((prev) => [...prev.slice(-99), evt])
            } catch { /* skip malformed */ }
          }
        }
      } catch { /* skip */ }
    }

    es.onerror = () => setOffline(true)

    return () => es.close()
  }, [deviceId])

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  async function sendGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim()) return
    setSending(true)
    await fetch(`/api/relay/${deviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goal.trim() }),
    })
    setGoal('')
    setSending(false)
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Video frame */}
      <div className="relative bg-zinc-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
        {imgSrc ? (
          <img src={imgSrc} alt="Device screen" className="w-full h-full object-contain" />
        ) : (
          <p className="text-zinc-600 text-sm">{offline ? 'Device offline' : 'Waiting for signal…'}</p>
        )}
        {offline && (
          <div className="absolute top-2 right-2 bg-red-900/70 text-red-300 text-xs px-2 py-1 rounded">
            Offline
          </div>
        )}
      </div>

      {/* Event log */}
      <div className="flex-1 bg-zinc-900 rounded-lg p-3 overflow-y-auto max-h-48 text-xs font-mono space-y-1">
        {events.length === 0 && <p className="text-zinc-600">No events yet…</p>}
        {events.map((ev, i) => (
          <div key={i} className="text-zinc-400">
            {ev.type === 'log' ? ev.message : JSON.stringify(ev)}
          </div>
        ))}
        <div ref={eventsEndRef} />
      </div>

      {/* Goal input */}
      <form onSubmit={sendGoal} className="flex gap-2">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Enter a goal for the agent…"
          disabled={offline}
          className="flex-1 rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={sending || offline || !goal.trim()}
          className="rounded bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-40"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Create per-device page**

Create `web/app/dashboard/[deviceId]/page.tsx`:
```typescript
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { DeviceViewer } from '@/components/DeviceViewer'
import Link from 'next/link'

export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const session = await getSession(await headers())
  if (!session) redirect('/sign-in')

  const { deviceId } = await params

  const [device] = await db
    .select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) redirect('/dashboard')

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Devices
        </Link>
        <span className="text-zinc-700">/</span>
        <h1 className="text-xl font-semibold">{device.name}</h1>
      </div>
      <DeviceViewer deviceId={device.id} />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/dashboard`. Click on a device (after adding one via the modal in Task 13). Expect the per-device page to load with the video placeholder and event log. The goal input should be visible.

- [ ] **Step 4: Commit**

```bash
git add web/components/DeviceViewer.tsx web/app/dashboard/
git commit -m "feat(web): add per-device viewer page with SSE stream and command input"
```

---

## Task 15: Update service/config.py

**Files:**
- Modify: `service/config.py`

- [ ] **Step 1: Add DEVICE_ID, DEVICE_TOKEN, CLOUD_URL to config**

Read `service/config.py`. Add these lines after the existing `SETTINGS_PATH` line:

```python
# Cloud relay — set via /etc/guidenco/device.env on the Pi
DEVICE_ID    = os.environ.get("DEVICE_ID", "")
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
CLOUD_URL    = os.environ.get("CLOUD_URL", "https://openclaw.ai")
```

- [ ] **Step 2: Commit**

```bash
git add service/config.py
git commit -m "feat(service): add DEVICE_ID, DEVICE_TOKEN, CLOUD_URL to config"
```

---

## Task 16: Create service/ws_client.py

**Files:**
- Create: `service/ws_client.py`
- Modify: `service/requirements.txt`

- [ ] **Step 1: Add websockets to requirements**

Open `service/requirements.txt` and add:
```
websockets
```

- [ ] **Step 2: Create service/ws_client.py**

Create `service/ws_client.py`:
```python
"""
WebSocket relay client — bridges the local Pi service to the cloud web app.

Runs in a background thread started by server.py after fork.
Connects to wss://<CLOUD_URL>/relay/ws?device_token=<DEVICE_TOKEN>.
Forwards MJPEG frames (base64, throttled to ~5fps) and agent SSE events.
Receives command messages and enqueues them via streaming.enqueue().
"""

import asyncio
import base64
import json
import logging
import os
import queue
import threading
import time

import websockets

from config import CLOUD_URL, DEVICE_TOKEN

logger = logging.getLogger("guidenco.ws_client")

_FRAME_INTERVAL = 0.2  # seconds between forwarded frames (~5fps to cloud)


def start_in_thread() -> None:
    if not DEVICE_TOKEN:
        logger.warning("[ws_client] DEVICE_TOKEN not set — relay disabled")
        return
    t = threading.Thread(target=_run_loop, daemon=True, name="guidenco-ws-client")
    t.start()
    logger.info("[ws_client] relay thread started")


def _run_loop() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_connect_forever())


async def _connect_forever() -> None:
    ws_url = (
        CLOUD_URL.replace("https://", "wss://").replace("http://", "ws://")
        + f"/relay/ws?device_token={DEVICE_TOKEN}"
    )
    while True:
        try:
            async with websockets.connect(ws_url, ping_interval=30) as ws:
                logger.info(f"[ws_client] connected to {ws_url}")
                send_q: asyncio.Queue[str] = asyncio.Queue(maxsize=20)
                loop = asyncio.get_running_loop()

                # Start bridge threads that feed from threading.Queue → asyncio.Queue
                threading.Thread(
                    target=_frame_bridge, args=(send_q, loop), daemon=True, name="ws-frame-bridge"
                ).start()
                threading.Thread(
                    target=_event_bridge, args=(send_q, loop), daemon=True, name="ws-event-bridge"
                ).start()

                await asyncio.gather(
                    _sender(ws, send_q),
                    _receiver(ws),
                )
        except Exception as exc:
            logger.warning(f"[ws_client] disconnected ({exc}), retrying in 5s")
            await asyncio.sleep(5)


def _put_safe(q: asyncio.Queue, msg: str, loop: asyncio.AbstractEventLoop) -> None:
    """Thread-safe enqueue into an asyncio.Queue; drops if full."""
    def _put():
        if not q.full():
            q.put_nowait(msg)
    loop.call_soon_threadsafe(_put)


def _frame_bridge(send_q: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
    """Reads frames from the capture card, forwards to cloud at ~5fps."""
    from tools.capture_card_manager import get_manager

    mgr = get_manager()
    sub = mgr.subscribe()
    last_sent = 0.0

    try:
        while True:
            try:
                frame = sub.get(timeout=2)
            except queue.Empty:
                continue

            # Drain stale frames — only forward the freshest
            while True:
                try:
                    frame = sub.get_nowait()
                except queue.Empty:
                    break

            now = time.monotonic()
            if now - last_sent < _FRAME_INTERVAL:
                continue

            b64 = base64.b64encode(frame).decode()
            _put_safe(send_q, json.dumps({"type": "frame", "data": b64}), loop)
            last_sent = now
    finally:
        mgr.unsubscribe(sub)


def _event_bridge(send_q: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
    """Reads agent SSE events from the global broadcast and forwards them."""
    from server.streaming import _subscribe_global, _unsubscribe_global

    sub = _subscribe_global()
    try:
        while True:
            try:
                raw_sse = sub.get(timeout=2)
            except queue.Empty:
                continue
            _put_safe(send_q, json.dumps({"type": "event", "data": raw_sse}), loop)
    finally:
        _unsubscribe_global(sub)


async def _sender(ws: websockets.WebSocketClientProtocol, send_q: asyncio.Queue) -> None:
    while True:
        msg = await send_q.get()
        await ws.send(msg)


async def _receiver(ws: websockets.WebSocketClientProtocol) -> None:
    from server.streaming import enqueue

    async for message in ws:
        try:
            msg = json.loads(message)
            if msg.get("type") == "command":
                goal = msg.get("goal", "")
                instructions = msg.get("instructions", "")
                job_id = enqueue(goal, instructions)
                await ws.send(json.dumps({"type": "ack", "job_id": job_id}))
                logger.info(f"[ws_client] queued job {job_id}: {goal!r}")
        except Exception as exc:
            logger.error(f"[ws_client] command error: {exc}")
```

- [ ] **Step 3: Commit**

```bash
git add service/ws_client.py service/requirements.txt
git commit -m "feat(service): add WebSocket relay client (ws_client.py)"
```

---

## Task 17: Wire ws_client into service/server.py

**Files:**
- Modify: `service/server.py`

- [ ] **Step 1: Read current service/server.py**

Read `service/server.py` to find the `_post_fork` function — it currently calls `start_processor_in_worker`. Add the ws_client start call there.

- [ ] **Step 2: Add ws_client start call in _post_fork**

In `service/server.py`, find the `_post_fork` function and add the import + start call:

```python
def _post_fork(server, worker):
    mgr = _get_capture_manager()
    mgr._running = False
    mgr.start()
    from server.streaming import start_processor_in_worker
    start_processor_in_worker(_agent_run)
    # Start WebSocket relay to cloud
    from ws_client import start_in_thread as _start_ws
    _start_ws()
    print(f"[worker] Capture manager, job processor, and ws_client started in worker {worker.pid}", flush=True)
```

- [ ] **Step 3: Commit**

```bash
git add service/server.py
git commit -m "feat(service): start ws_client relay in gunicorn worker post-fork"
```

---

## Task 18: Update service/guidenco.service

**Files:**
- Modify: `service/guidenco.service`

- [ ] **Step 1: Update guidenco.service for new paths and env file**

Replace `service/guidenco.service` contents:
```ini
[Unit]
Description=Guidenco — vision-driven remote desktop automation
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/guidenco
ExecStartPre=/usr/local/bin/guidenco-hid-setup
ExecStart=/opt/guidenco/venv/bin/python3 /opt/guidenco/server.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/etc/guidenco/device.env

[Install]
WantedBy=multi-user.target
```

Note: runs as root so `ExecStartPre` no longer needs `sudo`. `EnvironmentFile` at `/etc/guidenco/device.env` provides `DEVICE_ID`, `DEVICE_TOKEN`, and `CLOUD_URL` to the process.

- [ ] **Step 2: Commit**

```bash
git add service/guidenco.service
git commit -m "feat(service): update systemd service for /opt/guidenco install path"
```

---

## Task 19: Install Script

**Files:**
- Create: `service/install.sh`

- [ ] **Step 1: Create service/install.sh**

Create `service/install.sh`:
```bash
#!/usr/bin/env bash
# Guidenco Pi installer — curl -fsSL https://openclaw.ai/install.sh | bash
set -euo pipefail

CLOUD_URL="${GUIDENCO_CLOUD_URL:-https://openclaw.ai}"
REPO_TARBALL="${GUIDENCO_TARBALL:-https://github.com/YOUR_ORG/guidenco/archive/refs/heads/main.tar.gz}"
INSTALL_DIR="/opt/guidenco"
ENV_FILE="/etc/guidenco/device.env"
SERVICE_FILE="/etc/systemd/system/guidenco.service"
HID_SCRIPT="/usr/local/bin/guidenco-hid-setup"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[guidenco]${NC} $*"; }
warn()  { echo -e "${YELLOW}[guidenco]${NC} $*"; }
error() { echo -e "${RED}[guidenco] ERROR:${NC} $*" >&2; exit 1; }
box()   {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  while IFS= read -r line; do echo -e "  $line"; done <<< "$1"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ── 1. Preflight ──────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || error "This script requires Linux (Raspberry Pi OS / Ubuntu)"
command -v sudo >/dev/null 2>&1 || error "sudo is required"
info "Checking connectivity to $CLOUD_URL..."
curl -fsSL --max-time 10 "$CLOUD_URL/api/health" >/dev/null 2>&1 \
  || error "Cannot reach $CLOUD_URL — check your internet connection"

# ── Update mode detection ─────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" && -d "$INSTALL_DIR" ]]; then
  info "Existing Guidenco install detected — updating service files..."
  UPDATE_MODE=1
else
  UPDATE_MODE=0
fi

# ── 2. System packages ────────────────────────────────────────────────────────
info "Installing system packages..."
sudo apt-get update -q -y
sudo apt-get install -y -q python3 python3-venv ffmpeg v4l-utils curl git

# ── 3. Download service ───────────────────────────────────────────────────────
info "Downloading Guidenco service..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$REPO_TARBALL" -o "$TMP/guidenco.tar.gz"
tar -xzf "$TMP/guidenco.tar.gz" -C "$TMP"
EXTRACTED=$(find "$TMP" -maxdepth 1 -type d -name "guidenco-*" | head -1)
[[ -d "$EXTRACTED/service" ]] || error "Downloaded tarball has unexpected structure"
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete "$EXTRACTED/service/" "$INSTALL_DIR/"

# ── 4. Python venv ────────────────────────────────────────────────────────────
info "Setting up Python environment..."
sudo python3 -m venv "$INSTALL_DIR/venv"
sudo "$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
sudo "$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"

# ── 5. HID gadget ─────────────────────────────────────────────────────────────
info "Configuring USB HID gadget..."
sudo cp "$INSTALL_DIR/setup_hid_gadget.sh" "$HID_SCRIPT"
sudo chmod +x "$HID_SCRIPT"

# ── Update mode: just restart and exit ────────────────────────────────────────
if [[ $UPDATE_MODE -eq 1 ]]; then
  sudo systemctl restart guidenco.service
  info "Update complete."
  exit 0
fi

# ── 6. Environment file (fresh install only) ──────────────────────────────────
DEVICE_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
sudo mkdir -p /etc/guidenco
{
  echo "DEVICE_ID=$DEVICE_ID"
  echo "CLOUD_URL=$CLOUD_URL"
} | sudo tee "$ENV_FILE" > /dev/null

# ── 7. Systemd service ────────────────────────────────────────────────────────
info "Installing systemd service..."
sudo cp "$INSTALL_DIR/guidenco.service" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable guidenco.service

# ── 8. Register with cloud ────────────────────────────────────────────────────
info "Registering device..."
RESPONSE=$(curl -fsSL -X POST "$CLOUD_URL/api/devices/claim-init" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\"}" 2>/dev/null) \
  || error "Failed to contact Guidenco cloud. Check your internet connection."
CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])" 2>/dev/null) \
  || error "Unexpected response from cloud: $RESPONSE"

# ── 9. Print code ─────────────────────────────────────────────────────────────
box "Guidenco installed!\n\n  To link this device:\n\n    1. Go to: ${BOLD}$CLOUD_URL${NC}\n    2. Sign in and click ${BOLD}Add Device${NC}\n    3. Enter code: ${BOLD}${GREEN}$CODE${NC}\n\n  Code expires in 15 minutes."

# ── 10. Poll for claim ────────────────────────────────────────────────────────
info "Waiting for device to be linked in the web app..."
TIMEOUT=900
ELAPSED=0
DEVICE_TOKEN=""

while [[ $ELAPSED -lt $TIMEOUT ]]; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  STATUS=$(curl -fsSL "$CLOUD_URL/api/devices/claim-status?device_id=$DEVICE_ID" 2>/dev/null \
    || echo '{"status":"error"}')
  CLAIM_STATUS=$(echo "$STATUS" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null \
    || echo "error")

  if [[ "$CLAIM_STATUS" == "claimed" ]]; then
    DEVICE_TOKEN=$(echo "$STATUS" | python3 -c \
      "import sys,json; print(json.load(sys.stdin)['device_token'])" 2>/dev/null) \
      || error "Could not parse device_token from response"
    break
  elif [[ "$CLAIM_STATUS" == "expired" ]]; then
    error "The pairing code expired. Re-run this script to generate a new one."
  fi
done

[[ -n "$DEVICE_TOKEN" ]] || error "Timed out waiting for device to be linked (15 min). Re-run this script."

# ── Save token and start service ──────────────────────────────────────────────
echo "DEVICE_TOKEN=$DEVICE_TOKEN" | sudo tee -a "$ENV_FILE" > /dev/null
sudo systemctl start guidenco.service

box "${GREEN}Device linked successfully!${NC}\n\n  Your Raspberry Pi is now connected to Guidenco.\n  Open $CLOUD_URL to control it."
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x service/install.sh
```

- [ ] **Step 3: Lint the script for bash errors**

```bash
bash -n service/install.sh
# Expected: no output (no syntax errors)
```

- [ ] **Step 4: Commit**

```bash
git add service/install.sh
git commit -m "feat(service): add curl-installable Pi setup script"
```

---

## Task 20: Wire Up Root .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore for monorepo layout**

Read the existing `.gitignore` and ensure these entries are present (add any that are missing):

```gitignore
# Web
web/.next/
web/node_modules/
web/.env.local
web/lib/db/migrations/

# Service
service/__pycache__/
service/**/__pycache__/
service/*.pyc
service/venv/
service/temp/
service/.env

# Root
node_modules/
.DS_Store
```

- [ ] **Step 2: Verify no secrets are tracked**

```bash
git status --short
# Ensure web/.env.local is NOT listed — it should be gitignored
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: update .gitignore for monorepo layout"
```

---

## Task 21: Update Root package.json and README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Replace `README.md` with a monorepo-oriented overview:

```markdown
# Guidenco

Vision-driven remote desktop automation for Raspberry Pi — controlled from a hosted web dashboard.

## Packages

| Package | Description |
|---------|-------------|
| `web/` | Next.js web dashboard (Better Auth, PostgreSQL, MinIO) |
| `service/` | Raspberry Pi agent + Flask server (Python) |
| `skill/` | Claude Code skill for AI-assisted remote control |

## Quick Start — Pi

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

## Quick Start — Web (local dev)

```bash
cd web
cp .env.local.example .env.local   # fill in BETTER_AUTH_SECRET
docker compose up -d               # PostgreSQL + MinIO
npm install
npm run db:push                    # create tables
npm run dev                        # http://localhost:3000
```

## Architecture

The Raspberry Pi runs a Flask/Gunicorn server that owns all hardware (HDMI capture, USB HID). A WebSocket relay client (`ws_client.py`) connects the Pi to the hosted web app. Users register devices with a one-time pairing code generated at the end of the install script.

See `docs/superpowers/specs/2026-05-19-monorepo-split-design.md` for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for monorepo layout"
```

---

## Self-Review Checklist

- **Spec §1 Monorepo structure** → Tasks 1, 20, 21 ✓
- **Spec §2 Web app (Next.js, Better Auth, Drizzle, MinIO, Docker)** → Tasks 3-8, 12-14 ✓
- **Spec §2 Device registry routes** → Tasks 9-11 ✓
- **Spec §3 Device registration flow** → Tasks 9 (claim-init), 19 (install.sh poll), 13 (AddDeviceModal) ✓
- **Spec §4 WebSocket relay** → Tasks 8 (custom server), 11 (stream+command routes), 16 (ws_client.py) ✓
- **Spec §5 Install script** → Task 19 ✓
- **Spec §6 Skill** → Task 2 ✓
- **REPO URL placeholder** in `install.sh` — marked `YOUR_ORG/guidenco`, must be updated before deploy ✓ (noted)
- **Type consistency**: `devices.id` is `uuid`, `deviceClaims.deviceId` is `uuid`, they match throughout ✓
- **claim-status → device_token lookup**: uses `devices.id = claim.deviceId` — works because Task 9 `claim-redeem` sets `devices.id = claim.deviceId` ✓
