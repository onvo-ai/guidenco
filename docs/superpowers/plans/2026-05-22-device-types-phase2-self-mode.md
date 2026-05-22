# Device Types — Phase 2 (Self Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `guidenco-client` Python package that lets users control their own computer (macOS / Linux / Windows) from the Guidenco dashboard, with the same Auto + Manual experience the existing Pi delivers.

**Architecture:** A new Python package at `guidenco_client/` mirrors `service/ws_client.py` for the cloud connection (WebSocket relay + WebRTC offer/answer + data-channel input), but swaps the Pi's HDMI capture / USB HID for `mss` screen capture and `pynput` input injection. A small CLI does the existing claim-init handshake on first run, prints a pairing code, polls until the user enters the code in the dashboard, then runs the connection loop. New web endpoints serve OS-tailored install scripts plus a tarball of the Python package.

**Tech Stack:** Python 3.10+, `aiortc` 1.9+, `av`, `mss`, `Pillow`, `pynput`, `websockets`, `requests`, Next.js 16 (App Router), TypeScript, Tailwind.

---

## File Map

### Created — Python package

| Path | Responsibility |
|------|----------------|
| `guidenco_client/pyproject.toml` | Package metadata + entry points |
| `guidenco_client/__init__.py` | Package marker |
| `guidenco_client/main.py` | CLI: `init` (pair) + `run` (connect) |
| `guidenco_client/connection.py` | WebSocket relay client: frame loop + action dispatch + spawns WebRTC peer |
| `guidenco_client/webrtc.py` | RTCPeerConnection setup: video track + data-channel handlers |
| `guidenco_client/capture/__init__.py` | Selects backend by `sys.platform`; exposes `CaptureSource` |
| `guidenco_client/capture/mss_backend.py` | mss + Pillow screen capture, JPEG + RGB outputs |
| `guidenco_client/input/__init__.py` | Selects backend by `sys.platform`; exposes `InputSink` |
| `guidenco_client/input/pynput_backend.py` | pynput-based action dispatch |
| `guidenco_client/tests/test_input.py` | Unit tests for action → pynput call mapping |
| `guidenco_client/tests/test_key_map.py` | Unit tests for key-name → pynput Key mapping |

### Created — web

| Path | Responsibility |
|------|----------------|
| `web/app/api/install/self/[os]/route.ts` | Generates an install shell/PowerShell script for the chosen OS |
| `web/app/api/install/self/package.tar.gz/route.ts` | Streams a fresh tarball of `guidenco_client/` |

### Modified

| Path | Change |
|------|--------|
| `web/components/AddDeviceModal.tsx` | Enable Self option; on Self+OS chosen, show the matching install command + pairing form |

### Untouched

- `service/` (Pi-specific) — Bridged keeps working
- `web/lib/db/schema.ts` (Phase 1 columns already cover Self)
- `web/app/api/devices/claim-redeem/route.ts` (Phase 1 already accepts deviceType + os)
- `web/server.ts` (relay is type-agnostic)

---

## Task 1: Package scaffold

**Files:**
- Create: `guidenco_client/pyproject.toml`
- Create: `guidenco_client/__init__.py`
- Create: `guidenco_client/main.py` (stub)
- Create: `guidenco_client/capture/__init__.py` (stub)
- Create: `guidenco_client/input/__init__.py` (stub)
- Create: `guidenco_client/connection.py` (stub)
- Create: `guidenco_client/webrtc.py` (stub)
- Create: `guidenco_client/tests/__init__.py` (empty)

- [ ] **Step 1: Create `guidenco_client/pyproject.toml`**

```toml
[project]
name = "guidenco-client"
version = "0.1.0"
description = "Guidenco client — control your computer from the Guidenco dashboard."
requires-python = ">=3.10"
dependencies = [
  "aiortc>=1.9.0",
  "av>=11.0.0",
  "mss>=9.0.1",
  "Pillow>=10.0.0",
  "pynput>=1.7.6",
  "websockets>=12.0",
  "requests>=2.31.0",
]

[project.optional-dependencies]
test = ["pytest>=7.0"]

[project.scripts]
guidenco-client = "guidenco_client.main:main"

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["guidenco_client*"]
```

- [ ] **Step 2: Create the package-marker file**

`guidenco_client/__init__.py`:
```python
"""Guidenco client — runs on the user's own computer (macOS / Linux / Windows)."""

__version__ = "0.1.0"
```

- [ ] **Step 3: Create stub `main.py` so `guidenco-client --help` works**

`guidenco_client/main.py`:
```python
"""guidenco-client — CLI entry point."""
import argparse
import logging


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="guidenco-client")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("init", help="Pair with the cloud and start the client")
    sub.add_parser("run", help="Run the client using saved config")
    p.parse_args()
    raise SystemExit("Not yet implemented — coming in a later task.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Create stub backend modules**

`guidenco_client/capture/__init__.py`:
```python
"""Screen capture — backend selected by sys.platform."""
import sys

if sys.platform in ("darwin", "linux", "win32"):
    from .mss_backend import MssCapture as CaptureSource
else:
    raise RuntimeError(f"Unsupported platform: {sys.platform}")

__all__ = ["CaptureSource"]
```

`guidenco_client/capture/mss_backend.py` (stub, fleshed out in Task 2):
```python
"""Screen capture using mss + Pillow."""


class MssCapture:
    pass
```

`guidenco_client/input/__init__.py`:
```python
"""Input injection — backend selected by sys.platform."""
import sys

if sys.platform in ("darwin", "linux", "win32"):
    from .pynput_backend import PynputInput as InputSink
else:
    raise RuntimeError(f"Unsupported platform: {sys.platform}")

__all__ = ["InputSink"]
```

`guidenco_client/input/pynput_backend.py` (stub, fleshed out in Task 3):
```python
"""Input injection using pynput."""


class PynputInput:
    pass
```

`guidenco_client/connection.py`:
```python
"""WebSocket relay client (filled in Task 4)."""
```

`guidenco_client/webrtc.py`:
```python
"""WebRTC peer + data-channel handler (filled in Task 5)."""
```

`guidenco_client/tests/__init__.py`: empty file.

- [ ] **Step 5: Install in editable mode and verify the entry point**

```bash
cd /Users/ronnel/Desktop/guidenco && python3 -m venv guidenco_client/.venv
source guidenco_client/.venv/bin/activate
pip install -e guidenco_client/
guidenco-client --help
```

Expected output:
```
usage: guidenco-client [-h] {init,run} ...
...
```

(The actual command will exit with "Not yet implemented" if you run `init` or `run` — that's expected.)

- [ ] **Step 6: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add guidenco_client/
git commit -m "feat(client): scaffold guidenco-client Python package"
```

---

## Task 2: Capture backend (mss)

**Files:**
- Modify: `guidenco_client/capture/mss_backend.py`

- [ ] **Step 1: Implement `MssCapture`**

Replace the contents of `guidenco_client/capture/mss_backend.py` with:

```python
"""Cross-platform screen capture using mss + Pillow."""
import io

import mss
from PIL import Image


class MssCapture:
    """Captures the primary monitor. Frames are downscaled to <= 1280 px wide
    for streaming (matches the Pi's WebRTC encoder budget). The full-resolution
    screen size is preserved separately for input-coordinate scaling."""

    def __init__(self, max_width: int = 1280, jpeg_quality: int = 70) -> None:
        self._sct = mss.mss()
        # monitors[0] is the "all monitors" virtual, monitors[1] is primary
        self._monitor = self._sct.monitors[1]
        self._max_width = max_width
        self._jpeg_quality = jpeg_quality

    @property
    def screen_size(self) -> tuple[int, int]:
        """Real (un-downscaled) screen dimensions of the primary monitor."""
        return self._monitor["width"], self._monitor["height"]

    def _grab(self) -> Image.Image:
        raw = self._sct.grab(self._monitor)
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
        if img.width > self._max_width:
            ratio = self._max_width / img.width
            new_h = int(img.height * ratio)
            img = img.resize((self._max_width, new_h), Image.BILINEAR)
        return img

    def get_frame_jpeg(self) -> bytes:
        img = self._grab()
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=self._jpeg_quality)
        return buf.getvalue()

    def get_frame_rgb(self) -> tuple[int, int, bytes]:
        img = self._grab()
        return img.width, img.height, img.tobytes()

    def close(self) -> None:
        self._sct.close()
```

- [ ] **Step 2: Smoke test (manual, requires a display)**

```bash
cd /Users/ronnel/Desktop/guidenco
source guidenco_client/.venv/bin/activate
python3 -c "
from guidenco_client.capture import CaptureSource
c = CaptureSource()
data = c.get_frame_jpeg()
print('JPEG bytes:', len(data), 'magic:', data[:3].hex())
print('Screen size:', c.screen_size)
c.close()
"
```

Expected: JPEG bytes > 1000, magic `ffd8ff`, screen size like `(2560, 1440)` or whatever your primary display is.

- [ ] **Step 3: Commit**

```bash
git add guidenco_client/capture/
git commit -m "feat(client): mss-based screen capture, JPEG + RGB outputs"
```

---

## Task 3: Input backend (pynput action dispatch)

**Files:**
- Modify: `guidenco_client/input/pynput_backend.py`
- Create: `guidenco_client/tests/test_input.py`

- [ ] **Step 1: Write failing tests for action dispatch**

`guidenco_client/tests/test_input.py`:
```python
"""Tests for the pynput input backend. pynput is mocked so we don't actually
move the cursor during tests."""
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mocked_pynput():
    """Patch pynput so PynputInput uses MagicMocks for mouse/keyboard."""
    with patch("guidenco_client.input.pynput_backend.MouseController") as MC, \
         patch("guidenco_client.input.pynput_backend.KeyboardController") as KC:
        mouse = MagicMock()
        kb = MagicMock()
        MC.return_value = mouse
        KC.return_value = kb
        # Import AFTER patching so __init__ uses the mocks
        from guidenco_client.input.pynput_backend import PynputInput
        sink = PynputInput(screen_width=1000, screen_height=500)
        yield sink, mouse, kb


def test_mouse_move_scales_fraction_to_pixels(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    assert sink.execute({"type": "mouse_move", "x": 0.5, "y": 0.2}) == "ok"
    # 0.5 * 1000 = 500, 0.2 * 500 = 100
    assert mouse.position == (500, 100)


def test_left_click_positions_and_clicks(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    assert sink.execute({"type": "click", "x": 0.25, "y": 0.5, "button": "left"}) == "ok"
    assert mouse.position == (250, 250)
    # mouse.click(Button.left) — check it was called at least once
    assert mouse.click.called
    args, _ = mouse.click.call_args
    assert args[0].name == "left"


def test_right_click_uses_right_button(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    sink.execute({"type": "right_click", "x": 0.1, "y": 0.1})
    args, _ = mouse.click.call_args
    assert args[0].name == "right"


def test_double_click_calls_click_with_count_2(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    sink.execute({"type": "double_click", "x": 0.5, "y": 0.5})
    args, _ = mouse.click.call_args
    assert args[1] == 2 or (len(args) >= 2 and args[1] == 2)


def test_type_text_passes_string_to_keyboard(mocked_pynput):
    sink, _, kb = mocked_pynput
    sink.execute({"type": "type_text", "text": "hello world"})
    kb.type.assert_called_once_with("hello world")


def test_unknown_action_returns_error_string(mocked_pynput):
    sink, _, _ = mocked_pynput
    result = sink.execute({"type": "fly_to_moon"})
    assert "unknown action" in result.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ronnel/Desktop/guidenco
source guidenco_client/.venv/bin/activate
pip install pytest
pytest guidenco_client/tests/test_input.py -v
```

Expected: all 6 tests FAIL (PynputInput is still a stub class).

- [ ] **Step 3: Implement PynputInput**

Replace the contents of `guidenco_client/input/pynput_backend.py` with:

```python
"""Cross-platform input injection using pynput."""
import logging
import time

from pynput.keyboard import Controller as KeyboardController
from pynput.keyboard import Key
from pynput.mouse import Button
from pynput.mouse import Controller as MouseController

logger = logging.getLogger("guidenco_client.input")


# Special-key mapping from the browser's KeyboardEvent.key strings to pynput Keys.
# Single-character keys fall through and are sent verbatim.
KEY_MAP: dict[str, Key] = {
    "Enter": Key.enter,
    "Return": Key.enter,
    "Tab": Key.tab,
    "Escape": Key.esc,
    "Backspace": Key.backspace,
    "Delete": Key.delete,
    " ": Key.space,
    "ArrowUp": Key.up,
    "ArrowDown": Key.down,
    "ArrowLeft": Key.left,
    "ArrowRight": Key.right,
    "Home": Key.home,
    "End": Key.end,
    "PageUp": Key.page_up,
    "PageDown": Key.page_down,
    "Shift": Key.shift,
    "Control": Key.ctrl,
    "Alt": Key.alt,
    "Meta": Key.cmd,
}


class PynputInput:
    """Executes action dicts (mouse_move / click / key / type_text / scroll / drag)
    on the host OS via pynput. Coordinates in actions are fractional (0–1);
    they're scaled to the actual screen dimensions passed in the constructor."""

    def __init__(self, screen_width: int, screen_height: int) -> None:
        self._mouse = MouseController()
        self._kb = KeyboardController()
        self._w = screen_width
        self._h = screen_height

    def _xy(self, action: dict, x_key: str = "x", y_key: str = "y") -> tuple[int, int]:
        return int(action[x_key] * self._w), int(action[y_key] * self._h)

    def _press_modifiers(self, mods: dict) -> list[Key]:
        pressed: list[Key] = []
        for name, key in (("shift", Key.shift), ("ctrl", Key.ctrl), ("alt", Key.alt), ("meta", Key.cmd)):
            if mods.get(name):
                self._kb.press(key)
                pressed.append(key)
        return pressed

    def _release_modifiers(self, pressed: list[Key]) -> None:
        for key in reversed(pressed):
            self._kb.release(key)

    def execute(self, action: dict) -> str:
        action_type = action.get("type")
        try:
            if action_type == "mouse_move":
                self._mouse.position = self._xy(action)

            elif action_type == "click":
                self._mouse.position = self._xy(action)
                button = Button.right if action.get("button") == "right" else Button.left
                self._mouse.click(button)

            elif action_type == "right_click":
                self._mouse.position = self._xy(action)
                self._mouse.click(Button.right)

            elif action_type == "double_click":
                self._mouse.position = self._xy(action)
                self._mouse.click(Button.left, 2)

            elif action_type == "scroll":
                if "x" in action and "y" in action:
                    self._mouse.position = self._xy(action)
                dy = action.get("dy", 0)
                # pynput.scroll uses click units; browser uses pixel deltas (~120 per notch)
                self._mouse.scroll(0, -dy // 120 if dy else 0)

            elif action_type == "drag":
                sx, sy = self._xy(action, "start_x", "start_y")
                ex, ey = self._xy(action, "end_x", "end_y")
                self._mouse.position = (sx, sy)
                self._mouse.press(Button.left)
                time.sleep(0.05)
                self._mouse.position = (ex, ey)
                time.sleep(0.05)
                self._mouse.release(Button.left)

            elif action_type == "key":
                key_str = action["key"]
                key = KEY_MAP.get(key_str)
                if key is None and len(key_str) == 1:
                    key = key_str
                if key is None:
                    return f"unknown key: {key_str}"
                pressed = self._press_modifiers(action.get("modifiers", {}))
                self._kb.press(key)
                self._kb.release(key)
                self._release_modifiers(pressed)

            elif action_type == "type_text":
                self._kb.type(action["text"])

            else:
                return f"unknown action type: {action_type}"

            return "ok"

        except Exception as exc:
            logger.exception("action failed")
            return f"error: {exc}"
```

- [ ] **Step 4: Re-run tests to verify they pass**

```bash
pytest guidenco_client/tests/test_input.py -v
```

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add guidenco_client/input/ guidenco_client/tests/test_input.py
git commit -m "feat(client): pynput input dispatch (mouse, keyboard, scroll, drag)"
```

---

## Task 4: WebSocket relay client (`connection.py`)

**Files:**
- Modify: `guidenco_client/connection.py`

- [ ] **Step 1: Implement the connection loop**

Replace the contents of `guidenco_client/connection.py` with:

```python
"""WebSocket relay client — sends frames, dispatches incoming actions,
spawns WebRTC peers for offers."""
import asyncio
import base64
import json
import logging
import threading
import time

import websockets

from .capture import CaptureSource
from .input import InputSink
from .webrtc import handle_webrtc_offer

logger = logging.getLogger("guidenco_client.connection")

FRAME_INTERVAL = 0.2     # ~5 fps for the WebSocket frame fallback
RECONNECT_DELAY = 5      # seconds before retry after a disconnect


class ConnectionClient:
    """Holds the relay WebSocket and dispatches messages to capture / input / webrtc."""

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
        self._webrtc_tasks: set[asyncio.Task] = set()

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

            t = msg.get("type")
            if t == "action":
                action = msg.get("action", {})
                threading.Thread(
                    target=self._run_action, args=(action,),
                    daemon=True, name="action-exec",
                ).start()

            elif t == "webrtc:offer":
                sdp = msg.get("sdp", "")
                ice_servers = msg.get("iceServers") or []
                if sdp:
                    task = asyncio.create_task(
                        handle_webrtc_offer(sdp, ws, self._capture, self._input, ice_servers)
                    )
                    self._webrtc_tasks.add(task)
                    task.add_done_callback(self._webrtc_tasks.discard)
                else:
                    logger.warning("received webrtc:offer with empty sdp")

    def _run_action(self, action: dict) -> None:
        result = self._input.execute(action)
        if result != "ok":
            logger.warning(f"action result: {result}")
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile guidenco_client/connection.py && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add guidenco_client/connection.py
git commit -m "feat(client): WebSocket relay loop with frame forwarding and action dispatch"
```

---

## Task 5: WebRTC peer (`webrtc.py`)

**Files:**
- Modify: `guidenco_client/webrtc.py`

- [ ] **Step 1: Implement the offer handler + video track**

Replace the contents of `guidenco_client/webrtc.py` with:

```python
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

_VIDEO_FPS = 15  # WebRTC video track frame rate (browser viewer expectation)


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

        # Vanilla ICE: wait until all candidates are gathered (max 10 s)
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
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile guidenco_client/webrtc.py && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add guidenco_client/webrtc.py
git commit -m "feat(client): WebRTC peer with screen-capture video track and input data channel"
```

---

## Task 6: CLI — `init` and `run` subcommands

**Files:**
- Modify: `guidenco_client/main.py`

- [ ] **Step 1: Implement the full CLI**

Replace the contents of `guidenco_client/main.py` with:

```python
"""guidenco-client — CLI entry point.

Subcommands:
  init   Pair with the cloud (prints a code, polls until the dashboard claims
         it) and then enters the connection loop.
  run    Use existing config (~/.config/guidenco-client/device.json) to enter
         the connection loop.

With no subcommand: runs `run` if config exists, otherwise `init`.
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path

import requests

from .capture import CaptureSource
from .connection import ConnectionClient
from .input import InputSink

logger = logging.getLogger("guidenco_client.main")

CONFIG_DIR = Path.home() / ".config" / "guidenco-client"
CONFIG_FILE = CONFIG_DIR / "device.json"
CLAIM_POLL_INTERVAL = 2  # seconds


def _load_config() -> dict | None:
    if not CONFIG_FILE.exists():
        return None
    try:
        return json.loads(CONFIG_FILE.read_text())
    except Exception:
        return None


def _save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def _prompt_cloud_url() -> str:
    env_url = os.environ.get("GUIDENCO_CLOUD_URL")
    if env_url:
        return env_url
    raw = input("Cloud URL (e.g. https://guidenco.app): ").strip()
    if not raw:
        sys.exit("Cloud URL is required.")
    return raw


def cmd_init(_args: argparse.Namespace) -> None:
    cloud_url = _prompt_cloud_url().rstrip("/")
    device_id = str(uuid.uuid4())

    print(f"Requesting pairing code from {cloud_url} ...")
    try:
        r = requests.post(
            f"{cloud_url}/api/devices/claim-init",
            json={"device_id": device_id},
            timeout=15,
        )
        r.raise_for_status()
        code = r.json()["code"]
    except Exception as exc:
        sys.exit(f"Failed to request pairing code: {exc}")

    print()
    print(f"  Pairing code: {code}")
    print()
    print("Open Guidenco in your browser → + Add Device → Self → choose this OS")
    print("→ enter the code above and a name for this device.")
    print()
    print("Waiting for pairing ...", end="", flush=True)

    token = _poll_claim_status(cloud_url, device_id)
    print()  # newline after dots

    _save_config({
        "cloud_url": cloud_url,
        "device_id": device_id,
        "device_token": token,
    })
    print("Paired! Starting client (Ctrl-C to stop) ...")
    asyncio.run(_run_loop(cloud_url, token))


def _poll_claim_status(cloud_url: str, device_id: str) -> str:
    while True:
        try:
            r = requests.get(
                f"{cloud_url}/api/devices/claim-status",
                params={"device_id": device_id},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                status = data.get("status")
                if status == "claimed":
                    return data["device_token"]
                if status == "expired":
                    sys.exit("\nPairing code expired. Run `guidenco-client init` again.")
        except Exception:
            pass  # transient network error — keep polling
        print(".", end="", flush=True)
        time.sleep(CLAIM_POLL_INTERVAL)


def cmd_run(_args: argparse.Namespace) -> None:
    cfg = _load_config()
    if not cfg:
        sys.exit("Not paired yet — run `guidenco-client init` first.")
    asyncio.run(_run_loop(cfg["cloud_url"], cfg["device_token"]))


async def _run_loop(cloud_url: str, device_token: str) -> None:
    capture = CaptureSource()
    sw, sh = capture.screen_size
    logger.info(f"primary screen size: {sw}x{sh}")
    input_sink = InputSink(screen_width=sw, screen_height=sh)
    client = ConnectionClient(cloud_url, device_token, capture, input_sink)
    try:
        await client.run_forever()
    finally:
        capture.close()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    p = argparse.ArgumentParser(prog="guidenco-client")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("init", help="Pair with the cloud and start the client").set_defaults(func=cmd_init)
    sub.add_parser("run",  help="Run the client using saved config").set_defaults(func=cmd_run)
    args = p.parse_args()
    if args.cmd:
        args.func(args)
    else:
        # No subcommand: run if paired, otherwise init.
        (cmd_run if _load_config() else cmd_init)(args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Syntax check + dry-run --help**

```bash
cd /Users/ronnel/Desktop/guidenco
source guidenco_client/.venv/bin/activate
python3 -m py_compile guidenco_client/main.py && echo OK
guidenco-client --help
guidenco-client init --help
```

Expected: `OK`, then two help screens.

- [ ] **Step 3: Commit**

```bash
git add guidenco_client/main.py
git commit -m "feat(client): CLI init (pair) + run (connect) subcommands"
```

---

## Task 7: Install endpoints (per-OS scripts + tarball)

**Files:**
- Create: `web/app/api/install/self/[os]/route.ts`
- Create: `web/app/api/install/self/package.tar.gz/route.ts`

- [ ] **Step 1: Create the per-OS install script endpoint**

`web/app/api/install/self/[os]/route.ts`:
```typescript
import { NextRequest } from 'next/server'

type OS = 'macos' | 'linux' | 'windows'

const VALID_OS: ReadonlyArray<OS> = ['macos', 'linux', 'windows']

function isOs(v: string): v is OS {
  return (VALID_OS as ReadonlyArray<string>).includes(v)
}

// Resolve the public origin of this server from the incoming request so the
// script can curl back to the same host. We trust the standard proxy headers.
function originFromRequest(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const host = forwardedHost ?? req.headers.get('host') ?? 'localhost'
  const proto = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function macLinuxScript(origin: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

CLOUD_URL="${origin}"
INSTALL_DIR="$HOME/.local/share/guidenco-client"
BIN_DIR="$HOME/.local/bin"

echo "[guidenco-client] Installing into $INSTALL_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required. Install Python 3.10+ from https://www.python.org" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

echo "[guidenco-client] Downloading package..."
curl -fsSL "$CLOUD_URL/api/install/self/package.tar.gz" | tar -xz -C "$INSTALL_DIR"

echo "[guidenco-client] Creating virtual env..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet "$INSTALL_DIR/guidenco_client"

ln -sf "$INSTALL_DIR/venv/bin/guidenco-client" "$BIN_DIR/guidenco-client"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "[guidenco-client] NOTE: $BIN_DIR is not on your PATH. Add it to your shell rc to run 'guidenco-client' directly." ;;
esac

echo ""
echo "[guidenco-client] Installed. Starting pairing..."
echo ""

GUIDENCO_CLOUD_URL="$CLOUD_URL" "$INSTALL_DIR/venv/bin/guidenco-client" init
`
}

function windowsScript(origin: string): string {
  return `$ErrorActionPreference = "Stop"

$cloudUrl = "${origin}"
$installDir = Join-Path $env:LOCALAPPDATA "guidenco-client"

Write-Host "[guidenco-client] Installing into $installDir"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw "Python is required. Install Python 3.10+ from https://www.python.org" }

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host "[guidenco-client] Downloading package..."
$tarPath = Join-Path $installDir "package.tar.gz"
Invoke-WebRequest "$cloudUrl/api/install/self/package.tar.gz" -OutFile $tarPath -UseBasicParsing
tar -xzf $tarPath -C $installDir

Write-Host "[guidenco-client] Creating virtual env..."
python -m venv "$installDir\\venv"
& "$installDir\\venv\\Scripts\\pip.exe" install --quiet --upgrade pip
& "$installDir\\venv\\Scripts\\pip.exe" install --quiet "$installDir\\guidenco_client"

Write-Host ""
Write-Host "[guidenco-client] Installed. Starting pairing..."
Write-Host ""

$env:GUIDENCO_CLOUD_URL = $cloudUrl
& "$installDir\\venv\\Scripts\\guidenco-client.exe" init
`
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ os: string }> }) {
  const { os } = await ctx.params
  if (!isOs(os)) {
    return new Response(`Unknown OS: ${os}`, { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }
  const origin = originFromRequest(req)
  const body   = os === 'windows' ? windowsScript(origin) : macLinuxScript(origin)
  return new Response(body, {
    status:  200,
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
```

- [ ] **Step 2: Create the package tarball endpoint**

`web/app/api/install/self/package.tar.gz/route.ts`:
```typescript
import { spawn } from 'child_process'
import { join } from 'path'

// Streams a fresh tar.gz of guidenco_client/ generated on-the-fly by `tar`.
// Run from the repo root (parent of `web/`).
export async function GET() {
  const repoRoot = join(process.cwd(), '..')

  const proc = spawn('tar', ['-czf', '-', 'guidenco_client'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const body = new ReadableStream({
    start(controller) {
      proc.stdout.on('data', (chunk: Buffer) => {
        try { controller.enqueue(chunk) } catch { /* downstream closed */ }
      })
      proc.stdout.on('end',   () => { try { controller.close() } catch {} })
      proc.stderr.on('data',  (c: Buffer) => console.error('[install/package] tar stderr:', c.toString()))
      proc.on('error', (err) => controller.error(err))
      proc.on('exit',  (code) => { if (code !== 0) controller.error(new Error(`tar exited with code ${code}`)) })
    },
    cancel() { proc.kill('SIGTERM') },
  })

  return new Response(body, {
    headers: {
      'Content-Type':  'application/gzip',
      'Cache-Control': 'no-store',
    },
  })
}
```

- [ ] **Step 3: Smoke test both endpoints**

With the dev server running:
```bash
curl -fsSL http://localhost:3001/api/install/self/macos | head -10
curl -fsSL http://localhost:3001/api/install/self/linux | head -10
curl -fsSL http://localhost:3001/api/install/self/windows | head -10
curl -fsSL http://localhost:3001/api/install/self/package.tar.gz | tar -tz | head -5
```

Expected:
- First three: bash / PowerShell scripts starting with the appropriate shebang or `$ErrorActionPreference`
- Fourth: a list of files inside `guidenco_client/` (e.g. `guidenco_client/pyproject.toml`)

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -10
```

Expected: no errors outside of pre-existing `lib/agent.ts`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronnel/Desktop/guidenco
git add web/app/api/install/self/
git commit -m "feat(api): per-OS install scripts for Self mode + on-the-fly package tarball"
```

---

## Task 8: AddDeviceModal — enable Self mode

**Files:**
- Modify: `web/components/AddDeviceModal.tsx`

### Background

The wizard currently treats Self as `available: false` (Coming soon). We light it up and reuse the same install-command pattern as Bridged. When the user chooses Self + an OS, the modal shows the OS-specific install command pointing to `/api/install/self/<os>` with a copy button, plus the same pairing-code form. The POST body sends `os: chosen` because for Self the device IS the user's machine.

### Changes

- [ ] **Step 1: Flip Self to available**

In `web/components/AddDeviceModal.tsx`, find:
```tsx
  {
    id: 'self',
    label: 'Self',
    description: 'Control this computer directly with a small background client.',
    icon: <Monitor size={20} />,
    available: false,
  },
```
and change `available: false` to `available: true`.

- [ ] **Step 2: Add per-OS install command builders**

Replace the existing `installCommand` const (currently a single string for Bridged) with a helper that picks the right command for the current step:

```tsx
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const bridgedInstall = `curl -fsSL ${origin}/api/install/bridged | GUIDENCO_CLOUD_URL=${origin} sudo bash`
  const selfInstall =
    os === 'windows'
      ? `iwr ${origin}/api/install/self/windows -UseBasicParsing | iex`
      : os
        ? `curl -fsSL ${origin}/api/install/self/${os} | bash`
        : ''

  const installCommand = type === 'self' ? selfInstall : bridgedInstall
```

(Place this just above the existing `copyInstall` function in the component.)

- [ ] **Step 3: Render the Self details branch**

Find the existing details branch:
```tsx
        {step === 'details' && type === 'bridged' && (
          <>
            <p className="text-sm text-zinc-400">
              SSH into your Raspberry Pi, then run this command:
            </p>
```

Immediately after the closing `)}` of the Bridged branch (which ends with `</form>...</>) }`), add a new Self branch with the same install-command + pairing-form structure but different copy:

```tsx
        {step === 'details' && type === 'self' && (
          <>
            <p className="text-sm text-zinc-400">
              {os === 'windows'
                ? 'Open PowerShell on this computer and run:'
                : 'Open Terminal on this computer and run:'}
            </p>
            <div className="relative">
              <pre className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2.5 pr-12 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
                {installCommand}
              </pre>
              <button
                type="button"
                onClick={copyInstall}
                aria-label={copied ? 'Copied' : 'Copy install command'}
                className="absolute top-1.5 right-1.5 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              The script will install the client, then print a 6-character pairing code. Enter it below.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Device name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My laptop"
                  required
                  className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Pairing code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC-123"
                  required
                  maxLength={7}
                  className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-zinc-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded border border-zinc-700 py-2 text-sm hover:border-zinc-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded bg-zinc-100 text-zinc-900 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
                >
                  {loading ? 'Linking…' : 'Link Device'}
                </button>
              </div>
            </form>
          </>
        )}
```

The `handleSubmit` function already sends `os: type === 'self' ? os : null` (Phase 1 set this up), so nothing changes there.

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/ronnel/Desktop/guidenco/web && npx tsc --noEmit 2>&1 | grep -v "lib/agent.ts" | head -10
```

Expected: no errors outside of pre-existing `lib/agent.ts`.

- [ ] **Step 5: Manual UI verification**

With the dev server running, open the dashboard, click **+ Add Device**, click **Self**. The OS chooser should appear (full-width cards, same layout as the type chooser). Pick **macOS**. The next screen should show the Self install command (`curl -fsSL .../api/install/self/macos | bash`) with a copy button, followed by name + pairing-code fields.

Back-arrow should walk back: OS → type → close.

- [ ] **Step 6: Commit**

```bash
git add web/components/AddDeviceModal.tsx
git commit -m "feat(ui): enable Self mode in Add Device wizard with per-OS install commands"
```

---

## Manual End-to-End Verification (after all eight tasks)

These steps verify Self mode works on macOS. Repeat the same pattern on Linux and Windows.

1. Dev server running on `http://localhost:3001`. Pi can also be running (Bridged should not be affected).
2. From your Mac terminal:
   ```bash
   curl -fsSL http://localhost:3001/api/install/self/macos | bash
   ```
3. The install script pulls the tarball, sets up a venv at `~/.local/share/guidenco-client`, then runs `guidenco-client init`.
4. The CLI prints a 6-character pairing code and waits with `Waiting for pairing ....`.
5. In the dashboard: **+ Add Device** → **Self** → **macOS** → enter the code → name it "My Mac" → **Link Device**.
6. The CLI prints `Paired! Starting client...` and you should see `[ws_client] connected` in its output.
7. The Mac appears in the device list with a Monitor icon and `online` status.
8. Open it. The viewer loads, WebRTC streams the Mac's own screen back, and the data-channel logs (`[webrtc] input data channel open (reliable)` / `(unreliable)`) appear in the Pi's logs / dashboard browser console.
9. Switch to **Manual** and drag the mouse over the viewer — the Mac's cursor moves correspondingly. Click — the app underneath the cursor reacts. (On macOS first run, you'll need to grant the terminal accessibility permission in **System Settings → Privacy & Security → Accessibility** for `pynput` input to work.)

---

## Permissions & Caveats

- **macOS:** `pynput` requires the controlling process to have Accessibility permission. The first time you run `guidenco-client`, macOS will pop up a permission prompt; grant it for the terminal app you ran the install script from (Terminal, iTerm, etc.).
- **Linux:** X11 is supported via `pynput`. Wayland sessions are not supported in V1 — the script will run but mouse/keyboard injection will be silently no-ops on Wayland. (Self-Wayland support is out of scope.)
- **Windows:** `pynput`'s `SendInput`-based injection works for same-user apps. UAC-elevated apps cannot be controlled unless `guidenco-client` itself is running elevated — out of scope.

---

## Out of Scope (Phase 3)

- e2b sandbox provisioning for Remote (Phase 3)
- Auto-termination of idle Remote sandboxes (Phase 3)
- Lighting up the Remote card in the wizard (Phase 3)

---

## Out of Scope (V1 — future improvements)

- Per-OS persistent service installation (launchd / systemd / Scheduled Task). V1 = foreground process; user keeps the terminal open or backgrounds it manually.
- Wayland support on Linux
- UAC-elevated control on Windows
- Multi-display capture (V1 captures the primary display only)
- Hardware-accelerated H.264 / VP9 encoding (V1 uses VP8 software encode, capped at 720p)
- Auto-updates (V1 = re-run the install command to upgrade)
