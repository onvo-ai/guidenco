# Guidenco

Vision-driven remote desktop automation for Raspberry Pi — controlled from a hosted web dashboard.

## Packages

| Package | Description |
|---------|-------------|
| `web/` | Next.js web dashboard (Better Auth, PostgreSQL, MinIO) |
| `service/` | Raspberry Pi agent + Flask server (Python) |
| `skill/` | Claude Code skill for AI-assisted remote control |

## Quick Start — Pi

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

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

The Raspberry Pi runs a Flask/Gunicorn server that owns all hardware (HDMI capture, USB HID). A WebSocket relay client (`ws_client.py`) connects the Pi to the hosted web app. Users register devices with a one-time pairing code generated at the end of the install script.

See `docs/superpowers/specs/2026-05-19-monorepo-split-design.md` for the full design.
