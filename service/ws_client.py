"""
ws_client.py — Pi relay client.

Connects to wss://<CLOUD_URL>/relay/ws?device_token=<TOKEN>.
  • Streams JPEG frames from the capture card (~5 fps) to the cloud.
  • Receives action messages from the cloud and executes them via USB HID.

All agent / LLM logic lives in the web server. The Pi is pure I/O.
"""

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

logger = logging.getLogger("guidenco.ws_client")

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


def _run_action(action: dict):
    logger.info(f"[ws_client] executing action: {action.get('type')} {action}")
    result = _execute(action)
    if result != "ok":
        logger.warning(f"[ws_client] action result: {result}")
