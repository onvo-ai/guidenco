# Device Types — Design Spec

## Goal

Replace the single "Pi-only" Add Device flow with a chooser that lets users add three different kinds of device, all of which behave identically inside the existing viewer (Auto mode + Manual mode, WebRTC video, data-channel input):

| Type | What it is | Capture | Input |
|------|-----------|---------|-------|
| **Bridged** | A Raspberry Pi bridging an external computer over HDMI + USB-HID (current setup) | HDMI capture card → ffmpeg | USB-HID gadget |
| **Self** | A script running directly on the user's own computer, controlling that same computer | OS screen-capture API | OS input-injection API |
| **Remote** | A managed Linux desktop sandbox provisioned by the app | Same as Self-Linux (running inside the sandbox) | Same as Self-Linux |

The browser viewer and the server's relay are unchanged — every device, regardless of type, looks like the existing Pi from the server's point of view (WebSocket up, frames flowing, action messages forwarded, WebRTC offer/answer for direct video + input).

---

## Architecture

### Unified Client Package

A new Python package, `guidenco-client`, contains the device-side code that any non-bridged device runs:

```
service/                  # existing Pi-specific (HDMI + HID gadget) — unchanged
guidenco_client/          # NEW — runs on Mac / Linux / Windows / e2b sandbox
├── __init__.py
├── main.py               # entry point: connect WS, hold WebRTC, dispatch actions
├── ws.py                 # WebSocket relay client (mirror of service/ws_client.py)
├── webrtc.py             # WebRTC peer + data-channel handler
├── capture/
│   ├── __init__.py       # picks backend by sys.platform
│   ├── mss_backend.py    # cross-platform via `mss` (V1)
│   └── (future: native backends per OS)
└── input/
    ├── __init__.py       # picks backend by sys.platform
    ├── pynput_backend.py # cross-platform via `pynput` (V1)
    └── (future: native backends per OS)
```

The Pi keeps using `service/` because it has Pi-specific concerns (HDMI capture card, HID gadget setup, ffmpeg pipeline). `guidenco_client/` is a strict subset of that — no HDMI, no HID — using the host OS's own capture and input APIs.

`guidenco_client/ws.py` and `guidenco_client/webrtc.py` are very close copies of `service/ws_client.py`'s WebSocket and WebRTC code, refactored so the device-token-bearing relay loop and the offer handler live in modules that don't depend on `capture.py` (the Pi's HDMI capture) or `actions.py` (the Pi's HID layer). The only abstraction needed:

```python
# guidenco_client/capture/__init__.py
class CaptureSource:
    def get_frame(self) -> bytes:    # returns RGB or JPEG bytes
        ...

# guidenco_client/input/__init__.py
class InputSink:
    def execute(self, action: dict) -> str:
        # handles {type: mouse_move|click|key|type_text|scroll|drag|...}
        ...
```

Both backends are selected at import time by `sys.platform`:

```python
if sys.platform == 'darwin':   from .pynput_backend import PynputInput as InputSink
elif sys.platform == 'linux':  from .pynput_backend import PynputInput as InputSink
elif sys.platform == 'win32':  from .pynput_backend import PynputInput as InputSink
```

V1 uses one backend (`pynput`/`mss`) for all three OSes. Native backends can be slotted in later without changing the interface.

### Server / DB Schema

`devices` table gains two columns:

```typescript
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  deviceToken: text('device_token').notNull().unique(),
  status: text('status', { enum: ['online', 'offline'] }).notNull().default('offline'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

  // NEW
  deviceType: text('device_type', { enum: ['bridged', 'self', 'remote'] })
    .notNull()
    .default('bridged'),
  os: text('os', { enum: ['linux', 'macos', 'windows'] }),     // null for Bridged; 'linux' for Remote; chosen for Self
  metadata: jsonb('metadata'),                                  // type-specific state
})
```

`metadata` holds:
- **Bridged:** `null`
- **Self:** `{ "hostname": "ronnel-mbp" }` (optional, set on first connect)
- **Remote:** `{ "sandboxId": "e2b_abc123", "createdAt": "..." }`

The relay (`web/lib/relay.ts`) doesn't need to change — it just sees a `deviceToken`. Type-specific behaviour lives only at the edges (Add Device UI, the device-side client, the optional sandbox provisioner).

### Server-Side Sandbox Provisioner (Remote only)

A new module `web/lib/sandbox.ts` wraps the e2b SDK:

```typescript
export async function createSandbox(deviceId: string, deviceToken: string, cloudUrl: string): Promise<string>
export async function terminateSandbox(sandboxId: string): Promise<void>
```

`createSandbox` boots an e2b sandbox preloaded with `guidenco-client`, sets `CLOUD_URL` and `DEVICE_TOKEN` env vars, and starts the client inside the sandbox. The client connects back to the server over WebSocket exactly like a self-mode device. Sandbox lifecycle is bound to the device record: creating a Remote device provisions a sandbox; deleting the device terminates it.

The e2b API key is held server-side in `process.env.E2B_API_KEY` (app-owned). No user-side key management.

---

## Add Device Flow

The modal becomes a multi-step wizard:

### Step 1 — Choose type

Three cards:

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Bridged        │  │   Self           │  │   Remote         │
│                  │  │                  │  │                  │
│   Control any    │  │   Control this   │  │   Spin up a      │
│   computer via   │  │   computer       │  │   cloud Linux    │
│   a Raspberry Pi │  │                  │  │   desktop        │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Step 2 — Branch by type

- **Bridged:** existing flow (pairing-code field + name). Instructions point to the Pi install script.
- **Self:** OS chooser (macOS / Linux / Windows), then show a one-line install command for that OS, then a pairing-code field + name. Same pairing protocol as the Pi.
- **Remote:** name field only. On submit the server provisions an e2b sandbox in the background and the device appears online within ~30 seconds. No pairing code.

### Pairing flow (Bridged + Self)

Unchanged from today. The client (Pi `ws_client.py` or the new `guidenco-client`) hits `POST /api/devices/claim-init` with a generated `device_id`, prints the resulting 6-character code, and waits on `GET /api/devices/claim-status`. The user enters the code into the dashboard, which redeems it via `POST /api/devices/claim-redeem` along with the chosen `device_type` and (for Self) the `os`.

### Pairing flow (Remote)

There is no code-pairing step. The user submits a name; the server:

1. Inserts a `devices` row with `device_type='remote'`, `status='offline'`, a new `device_token`.
2. Calls `createSandbox(deviceId, deviceToken, CLOUD_URL)`.
3. Stores `{ sandboxId }` in `metadata`.
4. The sandbox's `guidenco-client` connects back over WebSocket using the token, exactly like any other device.

---

## Install Commands (Self mode)

Hosted at `https://<host>/install/<os>`:

- **macOS / Linux:** `curl -fsSL https://<host>/install/self/<os> | sh` — the script installs Python 3.11+ if missing, `pip install guidenco-client`, runs `guidenco-client init` which performs the claim-init handshake and prints the pairing code.
- **Windows:** `iwr https://<host>/install/self/windows -UseBasicParsing | iex` (PowerShell). Installs via `pip` if Python is present, otherwise prompts to install Python first. Same `init` step.

On macOS, the client must request Accessibility permission on first launch (required for `pynput` to inject events). The init script tells the user to grant the permission in System Settings → Privacy & Security → Accessibility.

On Linux, the client uses X11 input if available, otherwise prompts to install `xdotool` / enable uinput.

On Windows, no special permission is needed for SendInput-based input on the same desktop session. UAC-elevated apps are out of scope for V1 (the client would need to run elevated to control them).

---

## Action Dispatch — Identical Across All Types

The action JSON sent over the WebRTC data channel (or the WebSocket fallback) is the same regardless of device type:

```json
{ "type": "mouse_move", "x": 0.5, "y": 0.3 }
{ "type": "click", "x": 0.4, "y": 0.6, "button": "left" }
{ "type": "key", "key": "a", "modifiers": { "shift": false, "ctrl": false, "alt": false, "meta": false } }
{ "type": "type_text", "text": "hello world" }
{ "type": "scroll", "x": 0.5, "y": 0.5, "dx": 0, "dy": -120 }
{ "type": "drag", "start_x": 0.2, "start_y": 0.2, "end_x": 0.8, "end_y": 0.6 }
```

Each `InputSink` backend implements `execute(action)` to dispatch these to the host OS's input API. The Pi keeps using `service/actions.py` (USB HID); Self / Remote uses `guidenco_client/input/pynput_backend.py`.

---

## Capture — Same Frame Format Across All Types

All clients send the same frame messages over WebSocket:

```json
{ "type": "frame", "data": "<base64 jpeg, 1280x720 or similar>" }
```

And the same WebRTC video track encoded as VP8 at ≤720p.

For Self-mode capture on each OS:

- **macOS:** `mss` uses CoreGraphics screen captures; we cap at 720p for VP8 encoding speed on average hardware.
- **Linux:** `mss` uses X11 / Xlib. Wayland is not supported in V1 (fallback message in the install script if the user is on a Wayland-only session).
- **Windows:** `mss` uses GDI BitBlt.

Frame rate: 5 fps for the WebSocket frame stream (matches Pi); 15–30 fps for the WebRTC video track (driven by `_CaptureTrack` ticking the same capture source).

---

## Permissions and Security

- **Bridged:** unchanged (Pi runs as root).
- **Self:** the client runs as the logged-in user. Macros that need elevated input are explicitly out of scope.
- **Remote:** the e2b sandbox is the user's session; no permission concerns.

Action injection is gated by Manual mode + the user's session cookie. The server already enforces this — no change needed for the new types.

---

## Lifecycle & Cleanup

- **Bridged / Self:** identical to today. Deleting the device row removes it; the client on the user's machine stays installed but can't connect (its token is gone).
- **Remote:** deleting the device row triggers `terminateSandbox(metadata.sandboxId)` to free e2b resources. If the server crashes mid-provision, a periodic cleanup job (out of scope for V1) would reconcile orphaned sandboxes.

A device that has not connected in 24 hours stays in `offline` state. Remote devices that have been `offline` for >1 hour are auto-terminated to control e2b costs. (Threshold tunable via env var; V1 default: 1 hour.)

---

## Files Changed / Created

### Created

| Path | Responsibility |
|------|----------------|
| `guidenco_client/` (new package) | Cross-OS device client (Self + Remote) |
| `guidenco_client/main.py` | Entry point, CLI |
| `guidenco_client/ws.py` | WebSocket relay client |
| `guidenco_client/webrtc.py` | WebRTC peer + data-channel dispatch |
| `guidenco_client/capture/mss_backend.py` | Cross-platform screen capture |
| `guidenco_client/input/pynput_backend.py` | Cross-platform input injection |
| `guidenco_client/setup.py` (or `pyproject.toml`) | Package metadata for `pip install` |
| `web/lib/sandbox.ts` | e2b sandbox lifecycle |
| `web/app/api/install/[os]/route.ts` | Serves install shell/PowerShell script |

### Modified

| Path | Change |
|------|--------|
| `web/lib/db/schema.ts` | Add `deviceType`, `os`, `metadata` columns |
| `web/app/api/devices/claim-redeem/route.ts` | Accept `deviceType` and `os` in body |
| `web/app/api/devices/route.ts` | Branch on `deviceType` — `remote` creates a sandbox |
| `web/components/AddDeviceModal.tsx` | Multi-step wizard (type → details) |
| `web/components/DeviceCard.tsx` | Show a small icon per type |
| `service/ws_client.py` | No changes (still Bridged-specific) |

### Untouched

- `web/server.ts` (relay path is type-agnostic)
- `web/lib/relay.ts` (same)
- `web/components/DeviceViewer.tsx` (already works for any device)

---

## Implementation Phases (separate plans)

This spec produces three implementation plans, in dependency order:

1. **Foundation** — DB columns, AddDeviceModal wizard, branch logic. Pi is `device_type='bridged'`. No new client yet. Ships the chooser UI even though only Bridged works.
2. **Self mode** — `guidenco_client` package, install endpoints, claim flow for Self, pynput/mss backends. Ships full Self mode on Mac / Linux / Windows.
3. **Remote mode** — `web/lib/sandbox.ts`, e2b integration, claim-less provisioning, auto-termination. Ships zero-click sandbox provisioning.

Each phase is independently shippable. Phase 1 alone doesn't break anything (Bridged still works); phase 2 unlocks personal-machine control; phase 3 unlocks ephemeral cloud devices.

---

## Out of Scope (V1)

- Linux Wayland capture (X11 only)
- Multi-display support (capture primary display only)
- UAC-elevated control on Windows
- Audio capture / playback
- File transfer between browser and device
- Sandbox templates beyond the default Linux desktop
- User-provided e2b keys (app-owned only)
