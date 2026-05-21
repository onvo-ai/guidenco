"""
ws_client.py — Pi relay client.

Connects to wss://<CLOUD_URL>/relay/ws?device_token=<TOKEN>.
  • Streams JPEG frames from the capture card (~5 fps) to the cloud.
  • Receives action messages from the cloud and executes them via USB HID.

All agent / LLM logic lives in the web server. The Pi is pure I/O.
"""

import asyncio
import base64
import io
import json
import logging
import queue
import threading
import time

import av
import numpy as np
import websockets
from PIL import Image
from aiortc import MediaStreamError, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import VideoStreamTrack

from config import CLOUD_URL, DEVICE_TOKEN
from capture import get_manager as _get_capture
from actions import execute as _execute, cleanup as _cleanup

logger = logging.getLogger("guidenco.ws_client")


class _CaptureTrack(VideoStreamTrack):
    """Feeds JPEG frames from CaptureManager into a WebRTC video track."""

    def __init__(self, sub: queue.Queue) -> None:
        super().__init__()
        self._sub = sub
        self._stopped = False

    async def recv(self) -> av.VideoFrame:
        pts, time_base = await self.next_timestamp()

        loop = asyncio.get_running_loop()
        arr = await loop.run_in_executor(None, self._get_latest_as_array)

        vf = av.VideoFrame.from_ndarray(arr, format="rgb24")
        vf.pts = pts
        vf.time_base = time_base
        return vf

    def _get_latest_as_array(self) -> np.ndarray:
        """Block until a fresh frame arrives, decode JPEG to numpy array."""
        while True:
            # Drain the queue to get the freshest frame; timeout allows stop() to work
            try:
                frame = self._sub.get(timeout=1.0)
            except queue.Empty:
                if self._stopped:
                    raise MediaStreamError("_CaptureTrack stopped")
                continue
            while True:
                try:
                    frame = self._sub.get_nowait()
                except queue.Empty:
                    break
            try:
                img = Image.open(io.BytesIO(frame)).convert("RGB")
                return np.array(img)
            except Exception:
                continue  # discard corrupt frame, get the next one

    def stop(self) -> None:
        self._stopped = True
        _get_capture().unsubscribe(self._sub)
        super().stop()


async def _handle_webrtc_offer(
    sdp: str,
    ws: "websockets.WebSocketClientProtocol",
) -> None:
    """Handle one WebRTC offer from the server: create a PC, send an answer, hold until closed."""
    mgr = _get_capture()
    sub = mgr.subscribe()
    pc = RTCPeerConnection()
    track = _CaptureTrack(sub)
    pc.addTrack(track)

    closed = asyncio.Event()

    @pc.on("connectionstatechange")
    async def _on_state() -> None:
        state = pc.connectionState
        logger.info(f"[ws_client] WebRTC connectionState: {state}")
        if state in ("failed", "closed", "disconnected"):
            closed.set()

    try:
        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        # Vanilla ICE: wait until all candidates are gathered (max 10 s)
        loop = asyncio.get_running_loop()
        deadline = loop.time() + 10.0
        while pc.iceGatheringState != "complete":
            if loop.time() > deadline:
                logger.warning("[ws_client] ICE gathering timed out after 10s, sending partial answer")
                break
            await asyncio.sleep(0.1)

        if not pc.localDescription or not pc.localDescription.sdp:
            raise RuntimeError("localDescription is empty after ICE gathering")

        await ws.send(json.dumps({
            "type": "webrtc:answer",
            "sdp": pc.localDescription.sdp,
        }))
        logger.info("[ws_client] WebRTC answer sent")

        # Hold the coroutine alive until the peer closes — keeps pc/sub from being GC'd
        await closed.wait()
        logger.info("[ws_client] WebRTC peer closed")

    except Exception as exc:
        logger.error(f"[ws_client] WebRTC offer handling failed: {exc}")
    finally:
        await pc.close()
        mgr.unsubscribe(sub)
        logger.info("[ws_client] WebRTC peer closed, capture unsubscribed")


_FRAME_INTERVAL = 0.2   # seconds between forwarded frames (~5 fps)
_RECONNECT_DELAY = 5    # seconds before reconnect attempt


def start_in_thread() -> None:
    if not DEVICE_TOKEN:
        logger.warning("[ws_client] DEVICE_TOKEN not set — relay disabled")
        return
    t = threading.Thread(target=_run_loop, daemon=True, name="ws-relay")
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
            logger.info(f"[ws_client] connecting to {ws_url}")
            async with websockets.connect(ws_url, ping_interval=30) as ws:
                logger.info("[ws_client] connected")
                send_q: asyncio.Queue[str] = asyncio.Queue(maxsize=4)
                loop = asyncio.get_running_loop()

                threading.Thread(
                    target=_frame_bridge, args=(send_q, loop),
                    daemon=True, name="frame-bridge"
                ).start()

                await asyncio.gather(
                    _sender(ws, send_q),
                    _receiver(ws),
                )
        except Exception as exc:
            logger.warning(f"[ws_client] disconnected ({exc}), retrying in {_RECONNECT_DELAY}s")
            await asyncio.sleep(_RECONNECT_DELAY)


def _put_safe(q: asyncio.Queue, msg: str, loop: asyncio.AbstractEventLoop):
    def _enqueue():
        if not q.full():
            q.put_nowait(msg)
    loop.call_soon_threadsafe(_enqueue)


def _frame_bridge(send_q: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
    """Read frames from the capture card and forward to cloud at ~5 fps."""
    mgr = _get_capture()
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


async def _sender(ws: websockets.WebSocketClientProtocol, send_q: asyncio.Queue):
    while True:
        msg = await send_q.get()
        await ws.send(msg)


_webrtc_tasks: set[asyncio.Task] = set()


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
                task = asyncio.create_task(_handle_webrtc_offer(sdp, ws))
                _webrtc_tasks.add(task)
                task.add_done_callback(_webrtc_tasks.discard)
            else:
                logger.warning("[ws_client] received webrtc:offer with missing sdp")


def _run_action(action: dict):
    logger.info(f"[ws_client] executing action: {action.get('type')} {action}")
    result = _execute(action)
    if result != "ok":
        logger.warning(f"[ws_client] action result: {result}")
