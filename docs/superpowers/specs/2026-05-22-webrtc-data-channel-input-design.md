# WebRTC Data Channel Manual Input — Design Spec

**Goal:** Replace per-event HTTP POSTs for manual cursor/keyboard control with a WebRTC data channel so input travels peer-to-peer (browser → Pi) with no server relay and no HTTP overhead.

**Architecture:** Two data channels are created on the existing `RTCPeerConnection` before `createOffer()`, so they are negotiated in the same SDP exchange as the video track. The Pi's `aiortc` fires `on_datachannel` for each and pipes messages straight into the existing `_run_action` → `_execute` HID pipeline. The server is completely removed from the hot path once the connection is live. HTTP POST `/api/relay/:id/input` is kept as a fallback for when WebRTC is not yet established.

**Tech stack:** Browser `RTCDataChannel` API, `aiortc` SCTP data channel support, existing `_execute` HID layer in `service/actions.py`.

---

## Data Channels

Two channels are opened on the same `RTCPeerConnection`:

| Label | `ordered` | `maxRetransmits` | Used for |
|-------|-----------|-----------------|---------|
| `input` | `true` | default (reliable) | `click`, `right_click`, `key`, `scroll`, `drag` |
| `input-move` | `false` | `0` (unreliable) | `mouse_move` only |

Mouse moves are fire-and-forget — a lost packet is corrected by the next move event. Clicks and key presses use the reliable channel so they are never silently dropped.

---

## Message Format

The JSON sent on either channel is the raw action object, identical to what `_execute` already consumes:

```json
{ "type": "mouse_move", "x": 0.521, "y": 0.374 }
{ "type": "click", "x": 0.3, "y": 0.6, "button": "left" }
{ "type": "key", "key": "Return", "modifiers": { "shift": false, "ctrl": false, "alt": false, "meta": false } }
```

No wrapper envelope — the channel label is the routing key.

---

## Browser Changes (`web/components/DeviceViewer.tsx`)

### `useWebRTC`

Before `pc.createOffer()`:

```ts
const dcReliable = pc.createDataChannel('input',      { ordered: true })
const dcFast     = pc.createDataChannel('input-move', { ordered: false, maxRetransmits: 0 })
```

Both refs are stored in `useRef` and exposed in the hook's return value:

```ts
const inputDcRef     = useRef<RTCDataChannel | null>(null)
const inputMoveDcRef = useRef<RTCDataChannel | null>(null)
// ... assign dcReliable / dcFast to refs when created
return { videoRef, webrtcActive, inputDcRef, inputMoveDcRef }
```

Refs are nulled when the connection is closed or the component unmounts.

### `useManualInput`

Accepts two new props: `inputDcRef` and `inputMoveDcRef`. The `send` function becomes:

```ts
function send(action: Record<string, unknown>) {
  const dc = action.type === 'mouse_move' ? inputMoveDcRef.current : inputDcRef.current
  if (dc?.readyState === 'open') {
    dc.send(JSON.stringify(action))
    return
  }
  // HTTP fallback (WebRTC not yet established or failed)
  fetch(`/api/relay/${deviceId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  }).catch(() => {})
}
```

`send` is no longer `async` — data channel sends are synchronous fire-and-forget.

### Wiring in `DevicePageClient`

`useWebRTC` now returns `inputDcRef` and `inputMoveDcRef`. These are passed to `useManualInput`.

---

## Pi Changes (`service/ws_client.py`)

In `_handle_webrtc_offer`, after creating `pc` and adding the video track, register:

```python
@pc.on("datachannel")
def _on_datachannel(channel) -> None:
    logger.info(f"[ws_client] data channel: {channel.label}")

    @channel.on("message")
    def _on_message(msg: str) -> None:
        try:
            action = json.loads(msg)
        except Exception:
            logger.warning("[ws_client] data channel: invalid JSON")
            return
        threading.Thread(
            target=_run_action, args=(action,),
            daemon=True,
            name="dc-action",
        ).start()
```

`_run_action` and `_execute` are unchanged — they already handle all action types.

---

## Fallback Behaviour

`useManualInput.send` checks `dc?.readyState === 'open'` before using the channel. If WebRTC hasn't connected yet, is in SSE-only mode, or the channel is closing, it falls back to the existing HTTP POST. The HTTP endpoint (`/api/relay/:id/input`) is kept intact.

---

## What Does Not Change

- Server (`web/server.ts`): no changes — `/api/relay/:id/input` stays as fallback
- `relay.ts`: no changes
- `actions.py` / HID layer: no changes
- SDP signaling flow: no changes — data channels are included automatically when created before `createOffer()`
- ICE gathering / TURN: no changes — SCTP uses the same ICE candidates as the video track

---

## Files Changed

| File | Change |
|------|--------|
| `web/components/DeviceViewer.tsx` | Create data channels in `useWebRTC`; route input via DC in `useManualInput` |
| `service/ws_client.py` | Add `@pc.on("datachannel")` handler in `_handle_webrtc_offer` |
