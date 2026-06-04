"""WebSocket relay client — forwards screen frames and dispatches inbound actions.

Mirrors the Pi agent's relay: capture frames go up over the WebSocket, action
messages come down and are executed on the host. (No WebRTC — the cloud streams
frames over WS and events over SSE.)
"""
import asyncio
import base64
import json
import logging
import threading
import time

import websockets

from .capture import CaptureSource
from .input import InputSink

logger = logging.getLogger("guidenco_client.connection")

FRAME_INTERVAL = 0.2     # ~5 fps frame uplink
RECONNECT_DELAY = 5      # seconds before retry after a disconnect


class ConnectionClient:
    """Holds the relay WebSocket and dispatches messages to capture / input."""

    def __init__(
        self,
        cloud_url: str,
        device_token: str,
        capture: CaptureSource,
        input_sink: InputSink,
    ) -> None:
        self._cloud_url = cloud_url
        self._device_token = device_token
        self._capture = capture
        self._input = input_sink

    async def run_forever(self) -> None:
        ws_url = (
            self._cloud_url
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            + f"/relay/ws?device_token={self._device_token}"
        )
        while True:
            try:
                logger.info(f"connecting to {ws_url}")
                async with websockets.connect(ws_url, ping_interval=30) as ws:
                    logger.info("connected")
                    await asyncio.gather(
                        self._frame_loop(ws),
                        self._receive_loop(ws),
                    )
            except Exception as exc:
                logger.warning(f"disconnected ({exc}), retrying in {RECONNECT_DELAY}s")
                await asyncio.sleep(RECONNECT_DELAY)

    async def _frame_loop(self, ws) -> None:
        """Capture and forward JPEG frames at FRAME_INTERVAL."""
        last = 0.0
        while True:
            now = time.monotonic()
            if now - last >= FRAME_INTERVAL:
                jpeg = await asyncio.to_thread(self._capture.get_frame_jpeg)
                b64 = base64.b64encode(jpeg).decode()
                await ws.send(json.dumps({"type": "frame", "data": b64}))
                last = now
            await asyncio.sleep(0.05)

    async def _receive_loop(self, ws) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if msg.get("type") == "action":
                action = msg.get("action", {})
                threading.Thread(
                    target=self._run_action, args=(action,),
                    daemon=True, name="action-exec",
                ).start()

    def _run_action(self, action: dict) -> None:
        result = self._input.execute(action)
        if result != "ok":
            logger.warning(f"action result: {result}")
