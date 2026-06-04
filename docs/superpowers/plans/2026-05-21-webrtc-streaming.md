# WebRTC Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current SSE/base64 JPEG pipeline with WebRTC video so the browser receives a live, low-latency video track from the Pi instead of ~5 fps base64 frames.

**Architecture:** The existing Node.js server acts as a WebRTC signaling relay — it forwards an SDP offer from the browser to the Pi over the existing WebSocket, waits for the Pi's SDP answer, and returns it to the browser. ICE gathering is done "vanilla" style (wait for all candidates before sending SDP) so no trickle-ICE endpoint is needed. The SSE connection is kept for agent events and as a fallback video path when WebRTC is not available.

**Tech Stack:** `aiortc` (Python WebRTC on Pi), `av`/PyAV + `Pillow`/`numpy` (JPEG→VideoFrame decode), standard browser `RTCPeerConnection` API, Google STUN (`stun:stun.l.google.com:19302`), Node.js `ws`+Next.js for signaling relay.

---

## File Map

| File | Change |
|------|--------|
| `service/requirements.txt` | Add `aiortc`, `Pillow`, `numpy` |
| `service/install.sh` | Add `libsrtp2-dev libopus-dev python3-dev` to apt-get |
| `service/ws_client.py` | Add `_CaptureTrack`, `_handle_webrtc_offer`, wire into `_receiver` |
| `web/lib/relay.ts` | Add `webrtcPending` map, `waitForWebRTCAnswer` export, intercept `webrtc:answer` messages |
| `web/lib/relay.test.ts` | Unit test `waitForWebRTCAnswer` resolves and times out |
| `web/server.ts` | Add `POST /api/relay/:deviceId/webrtc-offer` handler |
| `web/components/DeviceViewer.tsx` | Add `useWebRTC` hook, add `<video>` to `Viewer`, show video when WebRTC active |

---

## Task 1: Pi — system packages and Python deps

**Files:**
- Modify: `service/requirements.txt`
- Modify: `service/install.sh` (around line 29: existing `apt-get install` line)

### Background

`aiortc` is a Python WebRTC library. It requires `libsrtp2` (secure RTP) as a system lib. `pylibsrtp` (an `aiortc` dep) wraps it. The `av` (PyAV) package handles JPEG→VideoFrame conversion; it has prebuilt ARM wheels so no local compilation needed. `Pillow` and `numpy` are used in our `_CaptureTrack`.

- [ ] **Step 1: Update requirements.txt**

Replace the entire file with:

```
websockets>=12.0
aiortc>=1.9.0
Pillow>=10.0.0
numpy>=1.24.0
```

- [ ] **Step 2: Add system packages to install.sh**

Find the line in `service/install.sh` that reads:
```bash
sudo apt-get install -y -q python3 python3-venv ffmpeg v4l-utils curl
```
Replace it with:
```bash
sudo apt-get install -y -q python3 python3-venv ffmpeg v4l-utils curl \
  libsrtp2-dev libopus-dev python3-dev
```

- [ ] **Step 3: Verify the change compiles (on Pi or in CI)**

On the Pi (or wherever you test), run:
```bash
cd /opt/guidenco
sudo venv/bin/pip install -r requirements.txt
```
Expected: installs without error. `aiortc`, `av`, `Pillow`, `numpy` should appear in `venv/bin/pip list`.

If `pylibsrtp` fails to build: ensure `libsrtp2-dev` is installed (`sudo apt-get install -y libsrtp2-dev`).

- [ ] **Step 4: Commit**

```bash
git add service/requirements.txt service/install.sh
git commit -m "feat(pi): add aiortc and system deps for WebRTC streaming"
```

---

## Task 2: Pi — CaptureTrack video stream track

**Files:**
- Modify: `service/ws_client.py`

### Background

`aiortc` uses `VideoStreamTrack` as the base for custom video sources. We subclass it to pull frames from the existing `CaptureManager` queue. `recv()` is called by `aiortc` whenever it needs the next frame. We:
1. Block in a thread executor (so the async event loop isn't blocked)
2. Drain any queued frames (get the freshest)
3. Decode JPEG bytes → PIL Image → numpy array → `av.VideoFrame`
4. Attach `pts`/`time_base` from `aiortc`'s `next_timestamp()` helper

### Current ws_client.py imports (top of file)
```python
import asyncio
import base64
import json
import logging
import queue
import threading
import time

import websockets

from config import CLOUD_URL, DEVICE_TOKEN
from capture import get_manager as _get_capture
from actions import execute as _execute, cleanup as _cleanup
```

- [ ] **Step 1: Add new imports at the top of ws_client.py**

Add after the existing imports, before the `logger = ...` line:

```python
import io

import av
import numpy as np
from PIL import Image
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import VideoStreamTrack
```

- [ ] **Step 2: Add the _CaptureTrack class**

Add this class after the imports (before `logger = ...`):

```python
class _CaptureTrack(VideoStreamTrack):
    """Feeds JPEG frames from CaptureManager into a WebRTC video track."""

    kind = "video"

    def __init__(self, sub: queue.Queue) -> None:
        super().__init__()
        self._sub = sub
        self._loop: asyncio.AbstractEventLoop | None = None

    async def recv(self) -> av.VideoFrame:
        # Capture the loop reference once (must be called from async context)
        if self._loop is None:
            self._loop = asyncio.get_running_loop()

        pts, time_base = await self.next_timestamp()

        # Decode JPEG in a thread executor so the event loop stays responsive
        frame_bytes = await self._loop.run_in_executor(None, self._get_latest)

        img = Image.open(io.BytesIO(frame_bytes)).convert("RGB")
        arr = np.array(img)
        vf = av.VideoFrame.from_ndarray(arr, format="rgb24")
        vf.pts = pts
        vf.time_base = time_base
        return vf

    def _get_latest(self) -> bytes:
        """Block until a frame arrives, then drain queue to get the freshest."""
        frame = self._sub.get()  # blocks
        while True:
            try:
                frame = self._sub.get_nowait()
            except queue.Empty:
                return frame
```

- [ ] **Step 3: Run a quick sanity check**

On the Pi (or locally if you have Python + aiortc):
```bash
python3 -c "from aiortc.mediastreams import VideoStreamTrack; print('OK')"
```
Expected: prints `OK` with no import error.

- [ ] **Step 4: Commit**

```bash
git add service/ws_client.py
git commit -m "feat(pi): add _CaptureTrack VideoStreamTrack for WebRTC"
```

---

## Task 3: Pi — WebRTC offer handler wired into relay loop

**Files:**
- Modify: `service/ws_client.py`

### Background

When the server sends `{"type":"webrtc:offer","sdp":"..."}` to the Pi, we:
1. Create an `RTCPeerConnection`
2. Subscribe to `CaptureManager` for frames
3. Attach a `_CaptureTrack` to the peer connection
4. Set the remote description (the offer)
5. Create an answer
6. Set the local description
7. Wait for ICE gathering to complete (vanilla ICE — no trickle)
8. Send `{"type":"webrtc:answer","sdp":"..."}` back via WebSocket
9. Keep the peer connection alive; clean up when it closes

We handle `webrtc:offer` in `_receiver` by spawning a task so the main receive loop doesn't block.

- [ ] **Step 1: Add _handle_webrtc_offer coroutine to ws_client.py**

Add this function after `_CaptureTrack` (before `logger = ...`):

```python
async def _handle_webrtc_offer(
    sdp: str,
    ws: "websockets.WebSocketClientProtocol",
) -> None:
    """Handle one WebRTC offer from the server: create a PC, send an answer."""
    mgr = _get_capture()
    sub = mgr.subscribe()

    pc = RTCPeerConnection()
    track = _CaptureTrack(sub)
    pc.addTrack(track)

    try:
        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        # Vanilla ICE: wait until all candidates are gathered
        deadline = asyncio.get_event_loop().time() + 10.0
        while pc.iceGatheringState != "complete":
            if asyncio.get_event_loop().time() > deadline:
                logger.warning("[ws_client] ICE gathering timed out after 10s, sending partial answer")
                break
            await asyncio.sleep(0.1)

        await ws.send(json.dumps({
            "type": "webrtc:answer",
            "sdp": pc.localDescription.sdp,
        }))
        logger.info("[ws_client] WebRTC answer sent")

        # Keep the connection alive until it closes
        @pc.on("connectionstatechange")
        async def _on_state() -> None:
            state = pc.connectionState
            logger.info(f"[ws_client] WebRTC connectionState: {state}")
            if state in ("failed", "closed", "disconnected"):
                await pc.close()
                mgr.unsubscribe(sub)
                logger.info("[ws_client] WebRTC peer closed, capture unsubscribed")

    except Exception as exc:
        logger.error(f"[ws_client] WebRTC offer handling failed: {exc}")
        await pc.close()
        mgr.unsubscribe(sub)
```

- [ ] **Step 2: Wire the handler into _receiver**

The existing `_receiver` function currently reads:
```python
async def _receiver(ws: websockets.WebSocketClientProtocol):
    """Receive messages from cloud and dispatch actions in a thread."""
    async for raw in ws:
        try:
            msg = json.loads(raw)
        except Exception:
            continue

        if msg.get("type") == "action":
            action = msg.get("action", {})
            # Execute in a thread so async loop stays unblocked
            threading.Thread(
                target=_run_action, args=(action,),
                daemon=True, name="action-exec"
            ).start()
```

Replace the entire `_receiver` function with:
```python
async def _receiver(ws: websockets.WebSocketClientProtocol):
    """Receive messages from cloud and dispatch actions or WebRTC offers."""
    async for raw in ws:
        try:
            msg = json.loads(raw)
        except Exception:
            continue

        msg_type = msg.get("type")

        if msg_type == "action":
            action = msg.get("action", {})
            threading.Thread(
                target=_run_action, args=(action,),
                daemon=True, name="action-exec"
            ).start()

        elif msg_type == "webrtc:offer":
            sdp = msg.get("sdp", "")
            if sdp:
                asyncio.ensure_future(_handle_webrtc_offer(sdp, ws))
            else:
                logger.warning("[ws_client] received webrtc:offer with missing sdp")
```

- [ ] **Step 3: Verify the file is valid Python**

```bash
cd /Users/ronnel/Desktop/guidenco/service
python3 -m py_compile ws_client.py && echo "OK"
```
Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add service/ws_client.py
git commit -m "feat(pi): handle WebRTC offer, generate answer with CaptureTrack"
```

---

## Task 4: Server — WebRTC signaling state in relay.ts

**Files:**
- Modify: `web/lib/relay.ts`
- Create: `web/lib/relay.test.ts`

### Background

The browser POSTs an SDP offer to the server, which forwards it to the Pi via WebSocket. The server then long-polls for the Pi's `webrtc:answer` message. We need:

1. A `webrtcPending` map from `deviceId` to a `(sdp: string) => void` resolve function
2. `waitForWebRTCAnswer(deviceId)` — returns a Promise that resolves when the Pi sends an answer, or rejects after 15s
3. In `ws.on('message')`: if `msg.type === 'webrtc:answer'`, call the pending resolver instead of forwarding to SSE listeners (the answer should not appear as an SSE event)

- [ ] **Step 1: Write a failing test for waitForWebRTCAnswer**

Create `web/lib/relay.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the exported logic of waitForWebRTCAnswer by accessing the
// module's exported function directly.  The Map state is module-level
// so we re-import the module fresh per describe block using vi.resetModules().
describe('waitForWebRTCAnswer', () => {
  beforeEach(() => { vi.resetModules() })

  it('resolves with the SDP when _resolveWebRTCAnswer is called with matching deviceId', async () => {
    const { waitForWebRTCAnswer, _resolveWebRTCAnswer } = await import('./relay')
    const promise = waitForWebRTCAnswer('dev-1')
    _resolveWebRTCAnswer('dev-1', 'v=0\r\no=- ...')
    const sdp = await promise
    expect(sdp).toBe('v=0\r\no=- ...')
  })

  it('rejects if no answer arrives within timeout', async () => {
    vi.useFakeTimers()
    const { waitForWebRTCAnswer } = await import('./relay')
    const promise = waitForWebRTCAnswer('dev-timeout')
    vi.advanceTimersByTime(16000)
    await expect(promise).rejects.toThrow('timeout')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run lib/relay.test.ts
```
Expected: FAIL — `_resolveWebRTCAnswer` is not exported from `relay.ts`.

- [ ] **Step 3: Implement the changes in relay.ts**

Current `relay.ts` top section (lines 1–14):
```typescript
import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { db } from './db/client'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'

// Active Pi connections: deviceId → WebSocket
const connections = new Map<string, WebSocket>()

// Latest frame per device: deviceId → base64 JPEG string
const latestFrames = new Map<string, string>()

// Browser SSE listeners: deviceId → Set of callbacks
const listeners = new Map<string, Set<(data: string) => void>>()
```

Replace the entire `relay.ts` file with:

```typescript
import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { db } from './db/client'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'

// Active Pi connections: deviceId → WebSocket
const connections = new Map<string, WebSocket>()

// Latest frame per device: deviceId → base64 JPEG string
const latestFrames = new Map<string, string>()

// Browser SSE listeners: deviceId → Set of callbacks
const listeners = new Map<string, Set<(data: string) => void>>()

// Pending WebRTC answer callbacks: deviceId → resolver
const webrtcPending = new Map<string, (sdp: string) => void>()

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

    let msg: Record<string, unknown> | null = null
    try { msg = JSON.parse(raw) } catch { /* non-JSON */ }

    if (msg) {
      // Buffer latest frame for agent loop
      if (msg.type === 'frame' && typeof msg.data === 'string') {
        latestFrames.set(device.id, msg.data as string)
      }

      // WebRTC answer — resolve pending offer promise; do NOT forward to SSE
      if (msg.type === 'webrtc:answer' && typeof msg.sdp === 'string') {
        _resolveWebRTCAnswer(device.id, msg.sdp as string)
        return
      }
    }

    // Forward everything else to browser SSE listeners
    const deviceListeners = listeners.get(device.id)
    deviceListeners?.forEach((cb) => cb(raw))
  })

  ws.on('close', () => {
    connections.delete(device.id)
    latestFrames.delete(device.id)
    listeners.delete(device.id)
    webrtcPending.delete(device.id)
    db
      .update(devices)
      .set({ status: 'offline' })
      .where(eq(devices.id, device.id))
      .catch((err) => console.error(`[relay] failed to mark device offline (${device.id}):`, err))
  })

  ws.on('error', (err) => {
    console.error(`[relay] Pi WS error (${device.id}):`, err.message)
  })
}

export function sendToDevice(deviceId: string, message: string): boolean {
  const ws = connections.get(deviceId)
  if (!ws || ws.readyState !== 1 /* OPEN */) return false
  ws.send(message, (err) => {
    if (err) console.error(`[relay] send failed (${deviceId}):`, err.message)
  })
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

/** Emit a JSON-serialisable event to all browser SSE listeners for this device. */
export function emitToListeners(deviceId: string, data: string) {
  const deviceListeners = listeners.get(deviceId)
  deviceListeners?.forEach((cb) => cb(data))
}

/** Latest JPEG frame (base64) received from the Pi, or null if none yet. */
export function getLatestFrame(deviceId: string): string | null {
  return latestFrames.get(deviceId) ?? null
}

export function isDeviceOnline(deviceId: string): boolean {
  const ws = connections.get(deviceId)
  return ws !== undefined && ws.readyState === 1
}

/**
 * Wait for the Pi to send a webrtc:answer for the given device.
 * Resolves with the answer SDP, or rejects after 15 seconds.
 * Exported as `_resolveWebRTCAnswer` for tests only.
 */
export function waitForWebRTCAnswer(deviceId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      webrtcPending.delete(deviceId)
      reject(new Error(`WebRTC answer timeout for device ${deviceId}`))
    }, 15_000)

    webrtcPending.set(deviceId, (sdp: string) => {
      clearTimeout(timer)
      resolve(sdp)
    })
  })
}

/** Called internally (and exported for tests) when a webrtc:answer arrives. */
export function _resolveWebRTCAnswer(deviceId: string, sdp: string): void {
  const resolver = webrtcPending.get(deviceId)
  if (resolver) {
    webrtcPending.delete(deviceId)
    resolver(sdp)
  }
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run lib/relay.test.ts
```
Expected: PASS (both tests green).

- [ ] **Step 5: Check TypeScript**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/relay.ts web/lib/relay.test.ts
git commit -m "feat(server): add WebRTC answer signaling state to relay"
```

---

## Task 5: Server — WebRTC offer endpoint in server.ts

**Files:**
- Modify: `web/server.ts`

### Background

We add one new HTTP route:

`POST /api/relay/:deviceId/webrtc-offer` — receives the browser's SDP offer, forwards it to the Pi via WebSocket, long-polls for the Pi's answer (up to 15s), and returns it.

The handler:
1. Auth-guards using the existing `getSession` helper
2. Verifies device ownership via DB
3. Checks the device is online
4. Registers a pending answer listener via `waitForWebRTCAnswer` (before sending, to avoid races)
5. Sends `{"type":"webrtc:offer","sdp":"..."}` to Pi via `sendToDevice`
6. Awaits the answer promise, returns `{"type":"answer","sdp":"..."}`

- [ ] **Step 1: Add the waitForWebRTCAnswer import to server.ts**

Find the existing import line near the top of `server.ts`:
```typescript
import { handleRelayUpgrade, addBrowserListener, isDeviceOnline, emitToListeners } from './lib/relay'
```
Replace it with:
```typescript
import { handleRelayUpgrade, addBrowserListener, isDeviceOnline, emitToListeners, waitForWebRTCAnswer } from './lib/relay'
```

- [ ] **Step 2: Add handleWebRTCOffer function to server.ts**

Add this function after `handleInput` (before `app.prepare().then(...)`):

```typescript
// POST /api/relay/:deviceId/webrtc-offer
// Receives browser SDP offer, forwards to Pi, returns Pi's SDP answer.
async function handleWebRTCOffer(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  if (!isDeviceOnline(deviceId)) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Device offline' }))
    return
  }

  const body = await readBody(req) as { sdp?: string; type?: string } | null
  if (!body?.sdp) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'sdp required' }))
    return
  }

  // Register answer listener BEFORE sending offer to avoid race condition
  const answerPromise = waitForWebRTCAnswer(deviceId)

  const { sendToDevice } = await import('./lib/relay')
  const sent = sendToDevice(deviceId, JSON.stringify({ type: 'webrtc:offer', sdp: body.sdp }))
  if (!sent) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Failed to reach device' }))
    return
  }

  try {
    const answerSdp = await answerPromise
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ type: 'answer', sdp: answerSdp }))
  } catch {
    res.writeHead(504, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Timeout waiting for WebRTC answer from device' }))
  }
}
```

- [ ] **Step 3: Add the route to the HTTP createServer handler**

Find the block inside `app.prepare().then(async () => {` where routes are matched. The existing `inputMatch` block ends with:
```typescript
    handle(req, res, parsedUrl)
  })
```

Add the new route **before** the final `handle(req, res, parsedUrl)` fallthrough. Find this existing block:
```typescript
    // Manual input relay — forwards mouse/keyboard actions to the Pi
    const inputMatch = pathname.match(/^\/api\/relay\/([^/]+)\/input$/)
    if (inputMatch && req.method === 'POST') {
      await handleInput(req, res, inputMatch[1])
      return
    }
```

Add the WebRTC offer route immediately after it (before `handle(req, res, parsedUrl)`):
```typescript
    // WebRTC offer — browser sends SDP offer, server relays to Pi, returns answer
    const webrtcOfferMatch = pathname.match(/^\/api\/relay\/([^/]+)\/webrtc-offer$/)
    if (webrtcOfferMatch && req.method === 'POST') {
      await handleWebRTCOffer(req, res, webrtcOfferMatch[1])
      return
    }
```

- [ ] **Step 4: Check TypeScript**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/server.ts
git commit -m "feat(server): add POST /api/relay/:id/webrtc-offer signaling endpoint"
```

---

## Task 6: Browser — WebRTC hook and video element in DeviceViewer.tsx

**Files:**
- Modify: `web/components/DeviceViewer.tsx`

### Background

We add a `useWebRTC` hook that:
1. Creates an `RTCPeerConnection` with Google STUN
2. Adds a `recvonly` video transceiver (we're receive-only; Pi sends)
3. Creates an offer, waits for vanilla ICE gathering (with a 5s timeout as safety)
4. POSTs the offer to `/api/relay/{deviceId}/webrtc-offer`
5. Sets the remote description (the Pi's answer)
6. On `ontrack`, attaches the stream to a `<video>` ref and sets `webrtcActive = true`
7. Counts fps using `requestVideoFrameCallback` (falls back to `requestAnimationFrame`)

The `useStream` hook keeps the SSE connection for agent events. When `!webrtcActive`, it also handles `frame` events for the SSE fallback (`<img>` element). This means users get SSE frames immediately, then WebRTC kicks in a few seconds later and shows a smoother video.

The `Viewer` component is updated to:
- Accept `videoRef` and `webrtcActive` props
- Show `<video>` when `webrtcActive === true`
- Show `<img>` otherwise (SSE fallback)

The `useManualInput` hook's `getViewRect` function is updated to use the `<video>` element's `videoWidth`/`videoHeight` when WebRTC is active.

- [ ] **Step 1: Add useWebRTC hook**

Open `web/components/DeviceViewer.tsx`. After the `useAgent` function (ends around line 153), add:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// useWebRTC — establishes a WebRTC peer connection for low-latency video
// ─────────────────────────────────────────────────────────────────────────────

function useWebRTC(
  deviceId: string,
  fpsCount: React.MutableRefObject<number>,
  fpsTime: React.MutableRefObject<number>,
  setFps: (n: number) => void,
  setHasFrame: (v: boolean) => void,
) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const pcRef      = useRef<RTCPeerConnection | null>(null)
  const [webrtcActive, setWebrtcActive] = useState(false)

  useEffect(() => {
    let pc: RTCPeerConnection | null = null
    let cancelled = false

    async function start() {
      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        })
        pcRef.current = pc

        pc.ontrack = (event) => {
          const video = videoRef.current
          if (!video || !event.streams[0]) return
          video.srcObject = event.streams[0]
          video.play().catch(() => {})
          if (cancelled) return
          setWebrtcActive(true)
          setHasFrame(true)

          // FPS counting via requestVideoFrameCallback (Chrome/Edge) or rAF fallback
          function tick() {
            if (cancelled || !video.srcObject) return
            fpsCount.current++
            const now = Date.now()
            if (now - fpsTime.current >= 1000) {
              setFps(fpsCount.current)
              fpsCount.current = 0
              fpsTime.current  = now
            }
            if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
              ;(video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void })
                .requestVideoFrameCallback(tick)
            } else {
              requestAnimationFrame(tick)
            }
          }
          if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            ;(video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void })
              .requestVideoFrameCallback(tick)
          } else {
            requestAnimationFrame(tick)
          }
        }

        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
            if (!cancelled) setWebrtcActive(false)
          }
        }

        // Receive-only: we never send video
        pc.addTransceiver('video', { direction: 'recvonly' })

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        // Vanilla ICE: wait until all candidates gathered (max 5s)
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') { resolve(); return }
          const onchange = () => {
            if (pc!.iceGatheringState === 'complete') {
              pc!.removeEventListener('icegatheringstatechange', onchange)
              resolve()
            }
          }
          pc!.addEventListener('icegatheringstatechange', onchange)
          setTimeout(resolve, 5000)
        })

        if (cancelled) { pc.close(); return }

        const res = await fetch(`/api/relay/${deviceId}/webrtc-offer`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sdp: pc.localDescription!.sdp, type: pc.localDescription!.type }),
        })

        if (!res.ok) throw new Error(`Offer rejected: ${res.status}`)

        const answer = await res.json() as { type: string; sdp: string }
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (err) {
        console.warn('[webrtc] failed, falling back to SSE:', err)
        // SSE frame handling in useStream continues as fallback
      }
    }

    start()

    return () => {
      cancelled = true
      pc?.close()
      pcRef.current = null
      setWebrtcActive(false)
    }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { videoRef, webrtcActive }
}
```

- [ ] **Step 2: Update useStream to accept shared fps refs and skip frame events when WebRTC is active**

The `useStream` hook currently owns `fpsCount`, `fpsTime`, and `setFps`. We need to share those refs with `useWebRTC`. The cleanest approach: `useStream` still owns the refs, and we pass them to `useWebRTC` from the parent hook call site. But since both hooks are called inside `DeviceViewer`, we'll hoist the refs there.

Replace the current `useStream` function signature from:
```typescript
function useStream(deviceId: string) {
  const imgRef    = useRef<HTMLImageElement>(null)
  const [items, setItems]       = useState<AgentItem[]>([])
  const [currentGoal, setCurrentGoal] = useState('')
  const [todoItems, setTodoItems]     = useState<TodoItem[]>([])
  const [taskStatus, setTaskStatus]   = useState<TaskStatus>(null)
  const [taskResultText, setTaskResultText] = useState<string | null>(null)
  const [offline, setOffline]   = useState(false)
  const [fps, setFps]           = useState(0)
  const [hasFrame, setHasFrame] = useState(false)
  const idRef    = useRef(0)
  const fpsCount = useRef(0)
  const fpsTime  = useRef(Date.now())
```

Replace with (adds `webrtcActiveRef` parameter to skip SSE frames when WebRTC is live):
```typescript
function useStream(deviceId: string, webrtcActiveRef: React.MutableRefObject<boolean>) {
  const imgRef    = useRef<HTMLImageElement>(null)
  const [items, setItems]       = useState<AgentItem[]>([])
  const [currentGoal, setCurrentGoal] = useState('')
  const [todoItems, setTodoItems]     = useState<TodoItem[]>([])
  const [taskStatus, setTaskStatus]   = useState<TaskStatus>(null)
  const [taskResultText, setTaskResultText] = useState<string | null>(null)
  const [offline, setOffline]   = useState(false)
  const [fps, setFps]           = useState(0)
  const [hasFrame, setHasFrame] = useState(false)
  const idRef    = useRef(0)
  const fpsCount = useRef(0)
  const fpsTime  = useRef(Date.now())
```

Then inside `useStream`, find the video frame handling block:
```typescript
        // Video frame — update img directly, no React re-render
        if (parsed.type === 'frame') {
          if (imgRef.current && parsed.data) {
            imgRef.current.src = `data:image/jpeg;base64,${parsed.data as string}`
            setHasFrame(true)
          }
          setOffline(false)
          fpsCount.current++
          const now = Date.now()
          if (now - fpsTime.current >= 1000) {
            setFps(fpsCount.current)
            fpsCount.current = 0
            fpsTime.current  = now
          }
          return
        }
```
Replace with:
```typescript
        // Video frame — SSE fallback only (skip when WebRTC is active)
        if (parsed.type === 'frame') {
          if (!webrtcActiveRef.current) {
            if (imgRef.current && parsed.data) {
              imgRef.current.src = `data:image/jpeg;base64,${parsed.data as string}`
              setHasFrame(true)
            }
            setOffline(false)
            fpsCount.current++
            const now = Date.now()
            if (now - fpsTime.current >= 1000) {
              setFps(fpsCount.current)
              fpsCount.current = 0
              fpsTime.current  = now
            }
          }
          return
        }
```

Also export `fpsCount` and `fpsTime` from `useStream` return value:
```typescript
  return { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, offline, fps, hasFrame, fpsCount, fpsTime, setFps, setHasFrame }
```
(The old return was: `return { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, offline, fps, hasFrame }`)

- [ ] **Step 3: Update DeviceViewer component to wire both hooks together**

Find the `DeviceViewer` export function. Replace the hook calls section:

Old:
```typescript
  const { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, offline, fps, hasFrame } = useStream(deviceId)
  const { running, startAgent, stopAgent } = useAgent(deviceId)
```

New:
```typescript
  // webrtcActiveRef is a ref (not state) so SSE handler can read it without re-renders
  const webrtcActiveRef = useRef(false)

  const { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, offline, fps, hasFrame, fpsCount, fpsTime, setFps, setHasFrame } = useStream(deviceId, webrtcActiveRef)
  const { videoRef, webrtcActive } = useWebRTC(deviceId, fpsCount, fpsTime, setFps, setHasFrame)
  const { running, startAgent, stopAgent } = useAgent(deviceId)

  // Keep webrtcActiveRef in sync with webrtcActive state
  useEffect(() => { webrtcActiveRef.current = webrtcActive }, [webrtcActive])
```

- [ ] **Step 4: Update Viewer component signature and JSX**

Find the `ViewerProps` interface. Add two new props:
```typescript
interface ViewerProps {
  imgRef: React.RefObject<HTMLImageElement | null>
  videoRef: React.RefObject<HTMLVideoElement | null>  // ← add
  webrtcActive: boolean                               // ← add
  shellRef: React.RefObject<HTMLDivElement | null>
  // ... rest unchanged
}
```

Update the `Viewer` function signature to accept the new props:
```typescript
function Viewer({ imgRef, videoRef, webrtcActive, shellRef, mode, fps, hasFrame, offline, deviceName, onModeChange, onSnapshot, onOpenSettings, onPointerMove, onPointerDown, onPointerUp, onContextMenu }: ViewerProps) {
```

Inside `Viewer`, find the stream `<div>` that contains the `<img>`:
```tsx
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="display stream"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
          draggable={false}
        />
```

Replace with:
```tsx
        {/* WebRTC video — shown when WebRTC connection is active */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: webrtcActive ? 'block' : 'none', userSelect: 'none', pointerEvents: 'none' }}
        />
        {/* SSE fallback — shown before WebRTC connects */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="display stream"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: webrtcActive ? 'none' : 'block', userSelect: 'none', pointerEvents: 'none' }}
          draggable={false}
        />
```

- [ ] **Step 5: Pass new props in DeviceViewer JSX**

Find the `<Viewer ...>` usage in `DeviceViewer`. Add the two new props:

Old:
```tsx
      <Viewer
        imgRef={imgRef}
        shellRef={shellRef}
```

New:
```tsx
      <Viewer
        imgRef={imgRef}
        videoRef={videoRef}
        webrtcActive={webrtcActive}
        shellRef={shellRef}
```

- [ ] **Step 6: Update useManualInput to work with video element for natural dimensions**

The `getViewRect` function currently reads `img.naturalWidth`/`img.naturalHeight`. When WebRTC is active, the `<img>` has no natural size (it may be empty). Update `useManualInput` to accept a `videoRef` parameter and use video dimensions when available.

Find `useManualInput` signature:
```typescript
function useManualInput(deviceId: string, mode: 'auto' | 'manual', shellRef: React.RefObject<HTMLDivElement | null>, imgRef: React.RefObject<HTMLImageElement | null>) {
```

Replace with:
```typescript
function useManualInput(
  deviceId: string,
  mode: 'auto' | 'manual',
  shellRef: React.RefObject<HTMLDivElement | null>,
  imgRef: React.RefObject<HTMLImageElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
```

Replace the `getViewRect` function inside `useManualInput`:
```typescript
  // Compute the letterboxed image rect inside the shell div
  function getViewRect(): { left: number; top: number; width: number; height: number } | null {
    const shell = shellRef.current
    if (!shell) return null
    const r = shell.getBoundingClientRect()

    // Use video dimensions when WebRTC is active, otherwise use img natural dimensions
    const video = videoRef.current
    const img   = imgRef.current
    let nw: number, nh: number
    if (video && video.videoWidth && video.videoHeight) {
      nw = video.videoWidth
      nh = video.videoHeight
    } else if (img && img.naturalWidth && img.naturalHeight) {
      nw = img.naturalWidth
      nh = img.naturalHeight
    } else {
      return null
    }

    const scale = Math.min(r.width / nw, r.height / nh)
    const dw = nw * scale, dh = nh * scale
    return { left: r.left + (r.width - dw) / 2, top: r.top + (r.height - dh) / 2, width: dw, height: dh }
  }
```

- [ ] **Step 7: Update useManualInput call site in DeviceViewer**

Find:
```typescript
  const { onPointerMove, onPointerDown, onPointerUp, onContextMenu } = useManualInput(deviceId, mode, shellRef, imgRef)
```

Replace with:
```typescript
  const { onPointerMove, onPointerDown, onPointerUp, onContextMenu } = useManualInput(deviceId, mode, shellRef, imgRef, videoRef)
```

- [ ] **Step 8: Type-check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 9: Run all tests**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 10: Manual smoke test**

1. Start the dev server: `npm run dev`
2. Open the browser console on the device viewer page
3. You should see no `[webrtc]` errors
4. After a few seconds (ICE gathering + Pi answer), the `<video>` element should become visible and show a smooth live feed
5. If the Pi is not available, the `<img>` SSE fallback should continue working at 5fps as before

- [ ] **Step 11: Commit**

```bash
git add web/components/DeviceViewer.tsx
git commit -m "feat(browser): add WebRTC video track with SSE fallback in DeviceViewer"
```

---

## Self-Review

**Spec coverage:**
- ✅ Replace SSE/base64 pipeline → WebRTC video track in browser
- ✅ Server as signaling relay → `/api/relay/:id/webrtc-offer`
- ✅ Pi sends video via aiortc `_CaptureTrack`
- ✅ STUN for ICE → `stun:stun.l.google.com:19302`
- ✅ SSE fallback kept for agent events + graceful video fallback
- ✅ Vanilla ICE (no trickle complexity)
- ✅ FPS counter works for both WebRTC and SSE paths
- ✅ Manual mode pointer coordinates use correct media dimensions (video or img)

**Placeholder scan:** None found.

**Type consistency:**
- `webrtcActiveRef` (MutableRefObject<boolean>) passed from `DeviceViewer` to `useStream` — consistent
- `fpsCount`, `fpsTime`, `setFps`, `setHasFrame` returned from `useStream` and passed to `useWebRTC` — consistent
- `videoRef` (RefObject<HTMLVideoElement | null>) threaded from `useWebRTC` through `DeviceViewer` to `Viewer` and `useManualInput` — consistent
- `waitForWebRTCAnswer` / `_resolveWebRTCAnswer` used in relay.ts and relay.test.ts — consistent

**Known limitation:** WebRTC P2P requires STUN to discover the Pi's public IP. Behind symmetric NAT or CGNAT, ICE will fail and the SSE fallback kicks in automatically. Adding a TURN relay server (e.g. coturn) would fix this but is out of scope for this plan.
