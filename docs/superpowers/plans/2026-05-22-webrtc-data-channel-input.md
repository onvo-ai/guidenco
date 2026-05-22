# WebRTC Data Channel Manual Input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-event HTTP POSTs for manual cursor/keyboard input with a WebRTC data channel so input travels peer-to-peer (browser → Pi) with no server relay.

**Architecture:** Two `RTCDataChannel` objects are created on the existing `RTCPeerConnection` before `createOffer()` so they are included in the same SDP negotiation as the video track. The browser routes `mouse_move` to the unreliable channel and all other actions to the reliable channel. The Pi listens for `on_datachannel` in `_handle_webrtc_offer` and dispatches messages to the existing `_run_action` → `_execute` HID pipeline. HTTP POST `/api/relay/:id/input` is kept as fallback when the data channel is not open.

**Tech Stack:** Browser `RTCDataChannel` API, `aiortc` SCTP data channels, existing `_execute` action dispatch in `service/actions.py`, TypeScript/React, Python 3.

---

## File Map

| File | Change |
|------|--------|
| `web/components/DeviceViewer.tsx` | Create data channels in `useWebRTC`; route input via DC in `useManualInput`; update call site |
| `service/ws_client.py` | Add `@pc.on("datachannel")` handler in `_handle_webrtc_offer` |

---

## Task 1: Browser — data channels in `useWebRTC` + routing in `useManualInput`

**Files:**
- Modify: `web/components/DeviceViewer.tsx`

### Background

`useWebRTC` currently lives at line 170–328. It returns `{ videoRef, webrtcActive }`.

`useManualInput` currently lives at line 334–405. It calls `fetch('/api/relay/:id/input', ...)` for every pointer event — one HTTP round-trip per mouse move.

The call site is at lines 1106 and 1109:

```ts
const { videoRef, webrtcActive } = useWebRTC(deviceId, fpsCount, fpsTime, setFps, setHasFrame, webrtcActiveRef)
const { onPointerMove, onPointerDown, onPointerUp, onContextMenu } = useManualInput(deviceId, mode, shellRef, imgRef, videoRef)
```

### Changes

- [ ] **Step 1: Add data channel refs and creation to `useWebRTC`**

Inside `useWebRTC`, add two `useRef` declarations directly after the existing `videoRef` and `webrtcActive` declarations (lines 178–179):

```ts
const videoRef         = useRef<HTMLVideoElement>(null)
const [webrtcActive, setWebrtcActive] = useState(false)
const inputDcRef       = useRef<RTCDataChannel | null>(null)
const inputMoveDcRef   = useRef<RTCDataChannel | null>(null)
```

Then, inside `start()`, immediately after the line `pc = new RTCPeerConnection({ iceServers })` (currently line 202), add:

```ts
const dcReliable = pc.createDataChannel('input',      { ordered: true })
const dcFast     = pc.createDataChannel('input-move', { ordered: false, maxRetransmits: 0 })
inputDcRef.current     = dcReliable
inputMoveDcRef.current = dcFast
```

**Important:** these two lines must appear before `pc.createOffer()`. If they come after, the data channels will not be included in the SDP negotiation.

Then, in the cleanup `return () => { ... }` block (currently lines 319–324), add two null assignments before `pc?.close()`:

```ts
return () => {
  cancelled = true
  inputDcRef.current     = null
  inputMoveDcRef.current = null
  pc?.close()
  setWebrtcActive(false)
  webrtcActiveRef.current = false
}
```

Finally, update the return statement (currently line 327) to expose the refs:

```ts
return { videoRef, webrtcActive, inputDcRef, inputMoveDcRef }
```

- [ ] **Step 2: Update `useManualInput` signature and `send` function**

`useManualInput` currently starts at line 334:

```ts
function useManualInput(
  deviceId: string,
  mode: 'auto' | 'manual',
  shellRef: React.RefObject<HTMLDivElement | null>,
  imgRef: React.RefObject<HTMLImageElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
```

Add two parameters at the end:

```ts
function useManualInput(
  deviceId: string,
  mode: 'auto' | 'manual',
  shellRef: React.RefObject<HTMLDivElement | null>,
  imgRef: React.RefObject<HTMLImageElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  inputDcRef: React.RefObject<RTCDataChannel | null>,
  inputMoveDcRef: React.RefObject<RTCDataChannel | null>,
) {
```

Replace the `send` callback (currently lines 341–347) entirely:

```ts
const send = useCallback((action: Record<string, unknown>) => {
  const dc = action.type === 'mouse_move' ? inputMoveDcRef.current : inputDcRef.current
  if (dc?.readyState === 'open') {
    dc.send(JSON.stringify(action))
    return
  }
  // HTTP fallback — used when WebRTC is not yet established or channel is closing
  fetch(`/api/relay/${deviceId}/input`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(action),
  }).catch(() => {})
}, [deviceId, inputDcRef, inputMoveDcRef])
```

Note: `send` is no longer `async` — data channel sends are synchronous. The `useEffect` that calls `send` for key events (line 381) calls it without `await`, so no other changes are needed there.

- [ ] **Step 3: Update the call site**

At the call site (currently lines 1106 and 1109), update both lines:

```ts
const { videoRef, webrtcActive, inputDcRef, inputMoveDcRef } = useWebRTC(deviceId, fpsCount, fpsTime, setFps, setHasFrame, webrtcActiveRef)
const { startAgent, stopAgent } = useAgent(deviceId)

const { onPointerMove, onPointerDown, onPointerUp, onContextMenu } = useManualInput(deviceId, mode, shellRef, imgRef, videoRef, inputDcRef, inputMoveDcRef)
```

- [ ] **Step 4: Verify TypeScript builds cleanly**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors. If you see `Property 'inputDcRef' does not exist`, the return type of `useWebRTC` wasn't updated. If you see `Expected N arguments, but got N+2`, the `useManualInput` signature wasn't updated.

- [ ] **Step 5: Add a log so you can confirm DC is open in the browser**

Inside `useWebRTC`, after the two `inputDcRef.current = ...` assignments, add:

```ts
dcReliable.onopen = () => console.log('[webrtc] input data channel open (reliable)')
dcFast.onopen     = () => console.log('[webrtc] input-move data channel open (unreliable)')
```

This log appears in the browser DevTools console when the Pi accepts the channels. You'll see it when you test in Task 2.

- [ ] **Step 6: Commit**

```bash
git add web/components/DeviceViewer.tsx
git commit -m "feat(browser): route manual input over WebRTC data channel, HTTP fallback"
```

---

## Task 2: Pi — `@pc.on("datachannel")` handler

**Files:**
- Modify: `service/ws_client.py`

### Background

`_handle_webrtc_offer` lives at lines 83–151. It creates a `RTCPeerConnection`, adds a video track, exchanges SDP, and waits for the connection to close.

When the browser offer includes SCTP data channels (which it will after Task 1), `aiortc` fires the `on_datachannel` event after `setRemoteDescription`. We register a handler before that call to receive both channels (`input` and `input-move`). Both channels dispatch to the existing `_run_action(action)` function which calls `_execute(action)` — the HID layer that already handles all action types.

### Change

- [ ] **Step 1: Add the `@pc.on("datachannel")` handler**

In `_handle_webrtc_offer`, locate the block that begins with `pc.addTrack(track)` (currently line 108). Add the handler immediately after it, before the `closed = asyncio.Event()` line:

```python
track = _CaptureTrack(sub)
pc.addTrack(track)

@pc.on("datachannel")
def _on_datachannel(channel) -> None:
    logger.info(f"[ws_client] data channel opened: {channel.label!r}")

    @channel.on("message")
    def _on_message(msg: str) -> None:
        try:
            action = json.loads(msg)
        except Exception:
            logger.warning("[ws_client] data channel: invalid JSON, ignoring")
            return
        threading.Thread(
            target=_run_action, args=(action,),
            daemon=True,
            name="dc-action",
        ).start()

closed = asyncio.Event()
```

No imports needed — `json` and `threading` are already imported at the top of the file, and `_run_action` is defined in the same module.

- [ ] **Step 2: Verify the file parses cleanly**

```bash
python3 -m py_compile service/ws_client.py && echo "OK"
```

Expected: `OK`. Any indentation error or syntax mistake will show the line number.

- [ ] **Step 3: Commit**

```bash
git add service/ws_client.py
git commit -m "feat(pi): handle WebRTC data channel for direct peer-to-peer manual input"
```

---

## Manual Verification (after both tasks)

With a Pi connected:

1. Open the device viewer page in Chrome.
2. Open DevTools → Console.
3. Wait for WebRTC to connect (video appears). You should see:
   ```
   [webrtc] input data channel open (reliable)
   [webrtc] input-move data channel open (unreliable)
   ```
4. Click **Manual** mode.
5. Move the mouse over the video — the Pi cursor should move with noticeably lower latency than before.
6. Click on the Pi screen — it should register.
7. Press a key (e.g. `a`) while hovering over the video — it should appear on the Pi.
8. In the Pi logs (`journalctl -u guidenco -f`), you should see lines like:
   ```
   [ws_client] data channel opened: 'input'
   [ws_client] data channel opened: 'input-move'
   [ws_client] executing action: mouse_move ...
   ```
