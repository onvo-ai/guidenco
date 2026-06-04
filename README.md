# Guidenco

Vision-driven remote desktop automation — controlled from a hosted web dashboard.
A vision-language agent runs in the cloud and drives a target machine through one
of three "device" backends.

## Packages

| Package | Description |
|---------|-------------|
| `web/` | Next.js dashboard + cloud relay (Better Auth, PostgreSQL, MinIO, agent loop) |
| `pi-agent/` | Raspberry Pi HID bridge — HDMI capture + USB HID gadget (Python) |
| `desktop-agent/` | Self-mode client — runs on your own computer (mss capture + pynput) |
| `skill/` | Claude Code skill for AI-assisted remote control |

## Device types

- **Bridged** — a Raspberry Pi captures the target's HDMI output and replays input
  as USB HID. Runs `pi-agent/`.
- **Self** — install the agent directly on the computer you want to control. Runs
  `desktop-agent/`.
- **Remote** — a cloud sandbox (e2b) provisioned on demand; runs `desktop-agent/`.

All three connect to the cloud the same way: frames stream up over a WebSocket,
the agent's actions come back down, and the browser watches over SSE.

## Quick Start — Raspberry Pi (Bridged)

```bash
curl -fsSL https://guidenco.app/api/install/bridged | sudo bash
```

The installer detects the capture hardware (USB HDMI capture card or HDMI-to-CSI
adapter), sets up the HID gadget, registers the device, and prints a pairing code
to enter in the dashboard.

## Quick Start — Web (local dev)

```bash
cd web
cp .env.local.example .env.local   # fill in BETTER_AUTH_SECRET
docker compose up -d               # PostgreSQL + MinIO
npm install
npm run db:push                    # create tables
npm run dev                        # http://localhost:3000
```

## Architecture

The Pi agent is pure I/O: `capture/` reads HDMI via ffmpeg/v4l2 and forwards JPEG
frames; `relay.py` holds the cloud WebSocket and dispatches inbound actions to the
USB HID gadget through `hid/`. All agent / LLM logic lives in `web/` — the agent
loop in `web/lib/agent.ts` calls the model, and `web/lib/relay.ts` brokers frames
and actions between the browser, the agent, and the device.

See `docs/superpowers/specs/` for design records.
