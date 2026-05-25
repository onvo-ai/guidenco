"""WebRTC peer connection — video track from screen capture + input data channels."""
import asyncio
import json
import logging
import threading

import av
import numpy as np
from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import VideoStreamTrack

from .capture import CaptureSource
from .input import InputSink

logger = logging.getLogger("guidenco_client.webrtc")


class _ScreenTrack(VideoStreamTrack):
    """Captures the screen on demand and feeds frames into a WebRTC video track."""

    def __init__(self, capture: CaptureSource) -> None:
        super().__init__()
        self._capture = capture

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        w, h, rgb = await asyncio.to_thread(self._capture.get_frame_rgb)
        arr = np.frombuffer(rgb, dtype=np.uint8).reshape((h, w, 3))
        frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
        frame.pts = pts
        frame.time_base = time_base
        return frame


async def handle_webrtc_offer(
    sdp: str,
    ws,
    capture: CaptureSource,
    input_sink: InputSink,
    ice_servers: list | None = None,
) -> None:
    """Set up a peer connection for one viewer session, send the answer, hold until closed."""
    if ice_servers:
        rtc_ice = [
            RTCIceServer(
                urls=s["urls"],
                username=s.get("username") or "",
                credential=s.get("credential") or "",
            )
            for s in ice_servers
        ]
        pc = RTCPeerConnection(configuration=RTCConfiguration(iceServers=rtc_ice))
    else:
        pc = RTCPeerConnection()

    track = _ScreenTrack(capture)
    pc.addTrack(track)

    @pc.on("datachannel")
    def _on_datachannel(channel) -> None:
        logger.info(f"data channel received: {channel.label!r}")

        @channel.on("message")
        def _on_message(msg: str) -> None:
            try:
                action = json.loads(msg)
            except Exception:
                logger.warning("data channel: invalid JSON, ignoring")
                return
            threading.Thread(
                target=lambda: input_sink.execute(action),
                daemon=True,
                name=f"dc-action-{channel.label}",
            ).start()

    closed = asyncio.Event()

    @pc.on("connectionstatechange")
    async def _state() -> None:
        state = pc.connectionState
        logger.info(f"WebRTC connectionState: {state}")
        if state in ("failed", "closed"):
            closed.set()

    try:
        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        loop = asyncio.get_running_loop()
        deadline = loop.time() + 10.0
        while pc.iceGatheringState != "complete":
            if loop.time() > deadline:
                logger.warning("ICE gathering timed out, sending partial answer")
                break
            await asyncio.sleep(0.1)

        if not pc.localDescription or not pc.localDescription.sdp:
            raise RuntimeError("localDescription is empty after ICE gathering")

        await ws.send(json.dumps({
            "type": "webrtc:answer",
            "sdp": pc.localDescription.sdp,
        }))
        logger.info("WebRTC answer sent")

        await closed.wait()

    except Exception as exc:
        logger.error(f"WebRTC offer handling failed: {exc}")
    finally:
        await pc.close()
