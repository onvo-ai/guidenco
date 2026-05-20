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
