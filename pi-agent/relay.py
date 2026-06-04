"""
relay.py — cloud relay client.

Maintains a WebSocket to wss://<CLOUD_URL>/relay/ws?device_token=<TOKEN> and:
  • forwards the freshest JPEG frame from the capture card (~5 fps), and
  • executes inbound action messages via the USB HID gadget.

All agent / LLM logic lives in the web server; the Pi is pure I/O.
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
from capture import get_manager
from hid import execute

logger = logging.getLogger("guidenco.relay")

FRAME_INTERVAL_S = 0.2   # ~5 fps uplink
RECONNECT_DELAY_S = 5


def start_in_thread() -> None:
    if not DEVICE_TOKEN:
        logger.warning("[relay] DEVICE_TOKEN not set — relay disabled")
        return
    threading.Thread(target=_run_loop, daemon=True, name="relay").start()
    logger.info("[relay] thread started")


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
            logger.info("[relay] connecting to %s", ws_url)
            async with websockets.connect(ws_url, ping_interval=30) as ws:
                logger.info("[relay] connected")
                send_q: asyncio.Queue[str] = asyncio.Queue(maxsize=4)
                loop = asyncio.get_running_loop()
                threading.Thread(
                    target=_frame_bridge, args=(send_q, loop),
                    daemon=True, name="frame-bridge",
                ).start()
                await asyncio.gather(_sender(ws, send_q), _receiver(ws))
        except Exception as exc:
            logger.warning("[relay] disconnected (%s), retrying in %ss", exc, RECONNECT_DELAY_S)
            await asyncio.sleep(RECONNECT_DELAY_S)


def _enqueue_from_thread(q: asyncio.Queue, msg: str, loop: asyncio.AbstractEventLoop) -> None:
    """Thread-safe, non-blocking enqueue onto an asyncio queue (drops if full)."""
    def _put() -> None:
        if not q.full():
            q.put_nowait(msg)
    loop.call_soon_threadsafe(_put)


def _frame_bridge(send_q: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
    """Forward the freshest capture frame to the cloud at ~5 fps."""
    sub = get_manager().subscribe()
    last_sent = 0.0
    try:
        while True:
            try:
                frame = sub.get(timeout=2)
            except queue.Empty:
                continue

            # Keep only the newest queued frame.
            while True:
                try:
                    frame = sub.get_nowait()
                except queue.Empty:
                    break

            now = time.monotonic()
            if now - last_sent < FRAME_INTERVAL_S:
                continue

            b64 = base64.b64encode(frame).decode()
            _enqueue_from_thread(send_q, json.dumps({"type": "frame", "data": b64}), loop)
            last_sent = now
    finally:
        get_manager().unsubscribe(sub)


async def _sender(ws: "websockets.WebSocketClientProtocol", send_q: asyncio.Queue) -> None:
    while True:
        await ws.send(await send_q.get())


async def _receiver(ws: "websockets.WebSocketClientProtocol") -> None:
    async for raw in ws:
        try:
            msg = json.loads(raw)
        except Exception:
            continue
        if msg.get("type") == "action":
            action = msg.get("action", {})
            threading.Thread(
                target=_run_action, args=(action,),
                daemon=True, name="action-exec",
            ).start()


def _run_action(action: dict) -> None:
    logger.info("[relay] executing action: %s", action.get("type"))
    result = execute(action)
    if result != "ok":
        logger.warning("[relay] action result: %s", result)
