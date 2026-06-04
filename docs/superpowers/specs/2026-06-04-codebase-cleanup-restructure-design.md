# Codebase Cleanup & Restructure — Design

**Date:** 2026-06-04
**Status:** Approved (verbal), implementing
**Author:** Guidenco / pairing session

## Context

Guidenco controls a remote Windows PC with a VLM agent. Inputs are delivered
over a USB HID gadget hosted on a Raspberry Pi; the screen is captured from
HDMI and streamed to the cloud. A recent architectural decision replaced WebRTC
video with **WebSocket frame forwarding + SSE event streaming**. That migration
landed in the web server and the browser viewer but left **dead WebRTC code** in
two of the three deployables and **broke Self mode** (the desktop client still
speaks WebRTC; the server no longer answers offers).

The system has just been validated on a **Pi Zero 2 W + CSI-to-HDMI bridge
(TC358743)**. We now want to retest on a **Pi 4 + USB HDMI capture card** and,
while doing so, clean and restructure the whole repo so a fresh device works
end-to-end from a single install script.

## Goals

1. Clean, role-descriptive structure across all three deployables + web.
2. Remove all dead WebRTC code (Pi agent, desktop agent, web TURN helper).
3. Make the Pi install **just work**: `curl … | bash` → pair in dashboard →
   running, with no manual steps and no aiortc compile toolchain.
4. Harden the **USB capture** path for the Pi 4 retest (dynamic format probe).
5. Re-point the installer at the **web app** as the source of truth for code.

## Non-goals

- No change to the agent loop / prompt behaviour (that work is already done and
  checkpointed).
- No change to the cloud relay protocol (WS frame + action messages, SSE events).
- No new product features.

## Target structure

```
pi-agent/              (was service/) — Raspberry Pi HID bridge
  main.py              entry point
  config.py            env-driven config
  relay.py             (was ws_client.py) — WS frame forward + action dispatch
  capture/             (was capture.py, split by backend)
    __init__.py        CaptureManager (lifecycle, subscribe, get_latest)
    base.py            shared MJPEG framing + ffmpeg helpers
    usb.py             USB HDMI capture card backend (dynamic fmt probe)
    csi.py             TC358743 HDMI-to-CSI backend (EDID + DV timings)
  hid/                 (was actions.py + hid_maps.py)
    __init__.py        execute(action) dispatch
    keymaps.py         (was hid_maps.py) — HID scan codes + key maps
    gadget.py          USB HID gadget setup (was setup_hid_gadget.sh)
  install.sh
  guidenco.service
  requirements.txt     → websockets only
desktop-agent/         (was guidenco_client/) — Self-mode client, WS+SSE
  guidenco_agent/      package (mss capture → JPEG over WS; pynput actions)
web/                   dashboard + cloud relay
  - delete lib/cloudflare-turn.ts (dead)
  - extract withDeviceAuth() helper in server.ts (kill 5x boilerplate)
  - add /api/install/bridged tarball endpoint (serves pi-agent/)
  - fix "WebRTC" marketing copy
```

## Key changes

### pi-agent (highest priority — Pi 4 retest target)
- Remove aiortc/`_CaptureTrack`/`_handle_webrtc_offer`/`webrtc:offer` handler and
  the WebRTC-conditional frame throttling from `relay.py`. The relay only:
  forwards freshest JPEG at ~5 fps over WS, and dispatches inbound actions.
- **USB capture robustness:** probe the device's pixel format/size via
  `v4l2-ctl --get-fmt-video` (as the CSI path already does) instead of
  hardcoding `1920x1080 mjpeg`. Resolution/fps overridable via env.
- `requirements.txt`: `websockets` only. (capture uses ffmpeg/v4l2 subprocesses;
  hid uses stdlib `struct`; nothing imports av/numpy/PIL once WebRTC is gone.)
- `install.sh`:
  - apt set shrinks to `python3 python3-venv ffmpeg v4l-utils curl`.
  - `REPO_TARBALL` → `$CLOUD_URL/api/install/bridged/tarball` (web app served).
  - drop `--system-site-packages` / `--no-build-isolation` venv workarounds that
    only existed to reuse apt-built av/numpy.
- Update `guidenco.service` / paths from `/opt/guidenco` (still fine) and
  references from `service/` → `pi-agent/` in the tarball layout.

### web
- Delete `lib/cloudflare-turn.ts` and any remaining imports.
- `server.ts`: extract `withDeviceAuth(req,res,deviceId, handler)` that does
  session + ownership lookup once; each route becomes a thin body.
- Add `app/api/install/bridged/` route that streams a gzipped tarball of
  `pi-agent/` (mirrors Self-mode's on-the-fly tarball).
- Replace "WebRTC stream" marketing copy with WebSocket/SSE description.

### desktop-agent
- Rename `guidenco_client/` → `desktop-agent/`, package `guidenco_agent/`.
- Replace `webrtc.py` + aiortc with a WS client mirroring pi-agent's `relay.py`:
  mss capture → JPEG → WS frames; inbound actions → pynput.
- pyproject deps drop aiortc/av/numpy(if unused)/Pillow-for-webrtc.
- ⚠️ Requires a desktop to test; untested until run.

## Sequencing (retest-first)

1. **pi-agent** restructure + install/tarball endpoint → commit. Flash Pi 4,
   retest USB capture end-to-end.
2. **web** dead-code removal + server.ts dedupe + copy fix → commit.
3. **desktop-agent** WS migration → commit (test when a desktop is available).

Each phase is independently committable and leaves the tree working.

## Risks / mitigations

- **USB card format variance** → dynamic v4l2 probe + env overrides.
- **Renaming breaks install path** → the only consumer of the folder name is the
  tarball layout + systemd `WorkingDirectory`; both updated in lockstep, and the
  installer now pulls from the web app so the GitHub path placeholder is gone.
- **Desktop-agent untested** → isolated to phase 3; pi retest unaffected.
