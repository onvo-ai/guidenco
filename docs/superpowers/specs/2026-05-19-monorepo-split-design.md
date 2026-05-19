# Guidenco Monorepo Split Design

**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Split the current single-folder Guidenco project into a monorepo with three packages:

- `web/` — hosted Next.js web app (multi-device dashboard, auth, database, storage)
- `service/` — Raspberry Pi agent/server (existing Python code, relocated)
- `skill/` — Claude Code skill (relocated from `.claude/skills/`)

The web app becomes the central control plane: users sign up, register Pi devices via a one-time pairing code, and control/monitor all their devices from one dashboard. The existing per-Pi local React UI (`frontend/`) is removed and replaced by the hosted web app.

---

## 1. Monorepo Structure

```
guidenco/
├── web/                        # Next.js app (App Router)
│   ├── app/                    # Routes, layouts, server components
│   ├── lib/
│   │   ├── auth.ts             # Better Auth config
│   │   ├── db/                 # Drizzle ORM schema + client
│   │   └── minio.ts            # MinIO client
│   ├── components/
│   ├── docker-compose.yml      # PostgreSQL + MinIO for local dev
│   ├── .env.local.example
│   └── package.json
├── service/                    # Python Pi agent (moved from root)
│   ├── agent/
│   ├── server/
│   ├── tools/
│   ├── config.py
│   ├── server.py
│   ├── ws_client.py            # NEW: WebSocket relay client
│   ├── install.sh              # NEW: curl-installable setup script
│   ├── ansible/
│   └── requirements.txt
├── skill/                      # Claude Code skill
│   └── guidenco-remote-control/
│       └── skill.md
└── package.json                # npm workspaces root (points to web/)
```

**Key changes from current layout:**
- All root-level Python files (`agent/`, `server/`, `tools/`, `config.py`, `server.py`, etc.) move into `service/`
- `frontend/` is deleted; replaced by `web/`
- `.claude/skills/remote-control/` moves to `skill/guidenco-remote-control/`
- `ansible/` moves into `service/ansible/`

---

## 2. Web App

**Framework:** Next.js (App Router)  
**Auth:** Better Auth  
**Database:** PostgreSQL via Drizzle ORM  
**Storage:** MinIO  
**Custom server:** `web/server.ts` wraps Next.js with a `ws` WebSocket server on the same port (required for Pi relay connections)

### Docker Compose (local dev)

`web/docker-compose.yml` runs:
- PostgreSQL on port 5432
- MinIO on ports 9000 (API) + 9001 (console)

### Database Schema

Better Auth manages `users`, `sessions`, `accounts`.

Additional tables:

```sql
-- Registered devices
devices (
  id            uuid PRIMARY KEY,
  user_id       → users.id,
  name          text NOT NULL,
  device_token  text UNIQUE NOT NULL,   -- long-lived auth token for Pi WS
  status        text DEFAULT 'offline', -- 'online' | 'offline'
  last_seen_at  timestamptz
)

-- Short-lived pairing records
device_claims (
  id          uuid PRIMARY KEY,
  device_id   uuid NOT NULL,            -- Pi's self-generated UUID
  code        text NOT NULL,            -- 6-char code, e.g. "ABC-123"
  expires_at  timestamptz NOT NULL,     -- 15 min from creation
  claimed_at  timestamptz               -- null until redeemed by user
)

-- Agent job history
agent_jobs (
  id           uuid PRIMARY KEY,
  device_id    → devices.id,
  goal         text NOT NULL,
  status       text DEFAULT 'pending',  -- 'pending'|'running'|'done'|'failed'
  created_at   timestamptz,
  completed_at timestamptz
)

-- Screenshot records (bytes in MinIO)
screenshots (
  id          uuid PRIMARY KEY,
  device_id   → devices.id,
  job_id      → agent_jobs.id (nullable),
  minio_key   text NOT NULL,
  created_at  timestamptz
)
```

### MinIO Storage

- Bucket: `guidenco`
- Key format: `{device_id}/{job_id}/{timestamp}.jpg`
- Web app generates presigned URLs on demand; never proxies raw bytes

### Web App Routes

| Route | Description |
|-------|-------------|
| `/` | Landing / sign-in redirect |
| `/dashboard` | List of user's devices |
| `/dashboard/[deviceId]` | Per-device viewer (live stream, command input, job history) |
| `/api/auth/[...all]` | Better Auth handler |
| `/api/devices/claim-init` | Pi calls this to start pairing; returns one-time code |
| `/api/devices/claim-status` | Pi polls this until claimed |
| `/api/devices/[id]` | CRUD for device records |
| `/relay/ws` | WebSocket endpoint — Pi connects here (handled by custom server, not Next.js route) |
| `/api/relay/[deviceId]/stream` | Browser SSE — live events from Pi |
| `/api/relay/[deviceId]/command` | Browser POSTs goals; forwarded to Pi |

---

## 3. Device Registration Flow

```
Pi (install.sh)                          Web App
─────────────────────────────────────────────────────────
1. Script installs dependencies, sets up service

2. Pi generates a local UUID (device_id)

3. POST /api/devices/claim-init
   { device_id }
                                    ──→  Creates device_claims row
                                         Returns { code: "ABC-123" }

4. Script prints:
   ┌─────────────────────────────────┐
   │  Guidenco installed!            │
   │  Go to https://openclaw.ai      │
   │  Add Device → enter: ABC-123    │
   └─────────────────────────────────┘

5. Pi polls GET /api/devices/claim-status?device_id=<uuid>
   every 5s, times out after 15 min

                         User opens web app, signs in,
                         clicks "Add Device", enters ABC-123
                                    ──→  Validates + claims code
                                         Creates devices row
                                         Returns device_token to Pi

6. Poll returns { status: "claimed", device_token: "dt_xxxx" }

7. Token saved to /etc/guidenco/device.env
   guidenco.service starts
   Script prints "Device linked! ✓"
```

Code expires after 15 minutes. If it expires before the user enters it, the install script prints an error and instructions to re-run.

---

## 4. WebSocket Relay

After registration the Pi maintains a persistent WebSocket to the web app. The web app bridges it to the user's browser.

```
Pi (ws_client.py)             Web App (custom WS server)      Browser
──────────────────────────────────────────────────────────────────────
Connects to:
wss://openclaw.ai/relay/ws
  ?device_token=dt_xxxx ──→   Auth token validated
                               Connection stored in memory:
                               { device_id → ws_connection }

Sends frames:
  { type: "frame",
    data: <jpg base64> } ──→  Forwarded to browser watching
                               this device

Sends events:
  { type: "event",
    data: {...} }        ──→  Forwarded to browser SSE stream

                              Browser opens:
                              /api/relay/[deviceId]/stream

                              Browser POSTs:
                              /api/relay/[deviceId]/command
                              { goal: "open chrome" }     ──→  Forwarded to Pi WS

                                                          Pi enqueues job,
                                                          responds { job_id }
```

**`service/ws_client.py`** — new asyncio WebSocket client that:
- Runs in a thread alongside the existing Flask/Gunicorn server
- Subscribes to the capture card manager's frame queue
- Subscribes to the agent SSE event stream
- Forwards both to the cloud WebSocket
- Receives command messages and calls the existing job queue API internally

**Next.js custom server (`web/server.ts`)** — wraps `next()` handler with a `ws.Server` on the same HTTP server, handling `/relay/ws` upgrades. In-memory map of `device_id → WebSocket` is sufficient for a single-process deploy; can be replaced with Redis pub/sub for multi-process later.

---

## 5. Install Script (`service/install.sh`)

Invoked via:
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

**Steps:**

1. **Preflight** — Linux ARM check, `sudo` check, internet check
2. **System packages** — `apt-get install python3 python3-venv ffmpeg v4l-utils curl git`
3. **Download service** — pull versioned tarball of `service/` to `/opt/guidenco`
4. **Python venv** — create venv at `/opt/guidenco/venv`, install pip deps
5. **HID gadget** — copy `setup_hid_gadget.sh`, grant passwordless `sudo` via `/etc/sudoers.d/guidenco`
6. **Environment file** — create `/etc/guidenco/device.env` with `DEVICE_ID=<uuid>`
7. **Systemd service** — write `guidenco.service`, `systemctl enable` (do not start yet)
8. **Register** — call `POST /api/devices/claim-init` → receive code
9. **Print code** — display pairing code clearly in the terminal
10. **Poll + start** — poll claim-status; on success, save `DEVICE_TOKEN` to `device.env`, `systemctl start guidenco.service`, print success

The systemd `EnvironmentFile=/etc/guidenco/device.env` makes `DEVICE_ID` and `DEVICE_TOKEN` available to the service process. `config.py` reads them via `os.environ`.

Re-running the script on an already-provisioned Pi detects `/opt/guidenco` and does a fast update (re-download + `systemctl restart`) instead of full setup.

---

## 6. Skill

`skill/guidenco-remote-control/skill.md` is the same content as the current `.claude/skills/remote-control/skill.md`, with the API base URL updated to point to `https://openclaw.ai` instead of the per-Pi tunnel URL.

The `.claude/skills/` directory in the project root will reference the new path.

---

## Out of Scope

- Multi-tenant device sharing (team members)
- Redis pub/sub for multi-process relay (single-process Next.js is sufficient initially)
- OAuth providers (Better Auth email/password is enough for v1)
- Video recording / playback (screenshots only for now)
