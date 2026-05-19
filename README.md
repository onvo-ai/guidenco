# Guidenco

A Raspberry Pi-based vision-driven desktop automation agent that uses a vision-language model (VLM) to control a remote Windows machine over USB HID.

---

## Overview

Guidenco captures screenshots of a remote machine (via HDMI capture card), sends them to a vision-language model (Qwen3-VL), receives tool calls (clicks, key presses, typing, drag), and physically emulates keyboard and mouse events over USB HID.

---

## Tech Stack

- **Backend**: Flask + Gunicorn (Python 3)
- **Frontend**: React (Vite, lucide-react icons)
- **AI/LLM Engine**: OpenAI-compatible client → Qwen3-VL via Ollama cloud
- **Hardware Interfaces**:
  - V4L2 + ffmpeg (HDMI capture card on `/dev/video0`)
  - USB HID gadgets:
    - `/dev/hidg0` (boot keyboard interface)
    - `/dev/hidg1` (absolute mouse interface)

---

## Project Structure

```
guidenco/
├── server.py               # Entry point — starts Gunicorn server
├── config.py               # Native/scaled resolution, coord space, video device path
├── utils.py                # Coordinate helpers (scale, coord_to_abs)
├── settings_store.py       # Single reader/writer for settings.json (schema + provider URLs)
├── settings.json           # Runtime config (LLM, network, agent timeout) — editable via UI
├── merge_settings.py       # Deploy helper — merges new setting keys without clobbering Pi values
├── deploy.sh               # Rsync deploy script to Pi
├── setup_hid_gadget.sh     # USB HID gadget setup (runs as ExecStartPre)
├── cloudflared-setup.sh    # Optional Cloudflare Tunnel installer
├── requirements.txt        # Python pip dependencies
├── guidenco.service        # systemd unit file
│
├── ansible/                # One-time Pi provisioning
│   ├── provision.yml       # Ansible playbook
│   ├── inventory.yml       # Host config
│   └── ansible.cfg         # Ansible settings
│
├── server/                 # Flask server package
│   ├── __init__.py
│   ├── app.py              # Flask app creation + blueprint registration
│   ├── api.py              # /api blueprint — wires up all route modules
│   ├── helpers.py          # Response helpers, temp dir, SSE/multipart framing
│   ├── streaming.py        # Job queue, global SSE broadcast, MJPEG capture streaming
│   ├── routes_capture.py   # /display/screenshot, /display/stream
│   ├── routes_action.py    # /agent/action, /agent/stream, /agent/queue, /agent/stop
│   ├── routes_settings.py  # /settings, /settings/network, /settings/wifi-networks, /settings/models
│   ├── routes_test.py      # /keyboard/*, /mouse/* (manual HID endpoints)
│   └── routes_static.py    # Static serving, /status, /api/temp/<file>
│
├── agent/                  # VLM agent package
│   ├── __init__.py
│   ├── __main__.py         # CLI entry (`python3 -m agent "goal"`)
│   ├── prompts.py          # System prompt + tool definitions
│   ├── actions.py          # Action normalization, describe, signature, coord math
│   ├── vlm.py              # VLM API calls, screenshot helpers, viz emission, web search
│   └── loop.py             # Main agent loop (screenshot → VLM → execute → repeat)
│
├── tools/                  # Hardware interaction layer
│   ├── __init__.py
│   ├── hid_maps.py                    # HID codes and keyboard layouts mapping configurations
│   ├── capture_card_manager.py        # Persistent ffmpeg process, frame pub/sub
│   ├── get_screenshot_capture_card.py # Single-frame capture (uses manager or fallback)
│   └── send_keyboard_events_usb.py    # USB HID keyboard + mouse event sender
│
├── docs/                   # Design specs
│
└── frontend/               # React web UI
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx               # Main layout: viewer + floating sidebar
    │   ├── index.css
    │   ├── lib/constants.js      # API_BASE
    │   ├── hooks/
    │   │   ├── useAgent.js         # Global agent SSE stream + job submission
    │   │   ├── useManualInput.js   # Manual HID forwarding (mouse/keyboard)
    │   │   ├── useScreenshot.js    # MJPEG viewer + FPS measurement
    │   │   └── useSettings.js      # Local settings persistence
    │   └── components/
    │       ├── Viewer.jsx          # Live display viewer
    │       ├── ChatFeed.jsx        # Agent reasoning feed
    │       ├── ChatInput.jsx       # Goal input + stop button
    │       ├── SettingsModal.jsx   # Settings panel
    │       ├── Toolbar.jsx         # Mode toggle, snapshot, FPS display
    │       └── ToolBubble.jsx      # Tool call visualization
    ├── dist/               # Built output (served by Flask)
    └── package.json
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Web UI (React app) |
| GET | `/status` | Server health + HID + capture card status |
| GET | `/api/display/screenshot` | JPEG from capture card (instant, no warmup) |
| GET | `/api/display/stream` | MJPEG stream from capture card |
| GET | `/api/agent/action?q=<goal>` | Enqueue a goal and stream its events until done (SSE) |
| GET | `/api/agent/stream` | Always-on global SSE stream of all agent events |
| POST | `/api/agent/queue?q=<goal>` | Enqueue a goal; returns `job_id` immediately |
| GET | `/api/agent/queue` | Current queue state (running + pending jobs) |
| POST/GET | `/api/agent/stop` | Cancel the running agent |
| GET | `/api/keyboard/key?k=ctrl+c` | Press key/combo via USB HID |
| GET | `/api/keyboard/type?text=hello` | Type text via USB HID |
| GET | `/api/mouse/move?x=500&y=500` | Move mouse (1–1000 coord space) |
| GET | `/api/mouse/click?b=left` | Click (left / right / double) |
| GET | `/api/mouse/drag?x1=100&y1=200&x2=800&y2=200` | Click-drag |
| GET/POST | `/api/settings` | Read / update runtime settings (LLM, network, agent) |
| GET | `/api/settings/network` | Configured or live Wi-Fi SSID |
| GET | `/api/settings/wifi-networks` | Scan available Wi-Fi networks |
| GET | `/api/settings/models` | List models from the configured LLM provider |
| GET | `/api/temp/<file>` | Serve a temp file (visualization images / thumbnails) |

---

## How It Works

1. Open a browser to `http://pi-ip:5000/`
2. Enter a goal in the sidebar chat box (e.g., "Open the browser and search for...")
3. The Pi captures a screenshot via the HDMI capture card
4. The screenshot is sent to Qwen3-VL (running via Ollama)
5. The model returns a reasoning chain and tool calls
6. The Pi executes the tool calls physically over USB HID
7. The sidebar visualizes the internal reasoning in real time (SSE)

---

## Provisioning a New Pi (First Time)

After flashing Ubuntu on the Pi and booting it:

```bash
# On your Mac — install Ansible
brew install ansible

# Set your Pi's IP and SSH password
export PI_HOST=192.168.0.42
export PI_PASS=191996

# Provision everything (packages, venv, frontend build, HID gadget, service)
cd ansible
ansible-playbook provision.yml
```

This single command:
1. Installs system packages (Python, ffmpeg, Node.js, v4l-utils, etc.)
2. Creates a Python venv and installs pip dependencies
3. Copies project code and builds the frontend
4. Sets up the USB HID gadget script with passwordless sudo
5. Installs and enables the `guidenco` systemd service

After provisioning, you must **unplug and replug the USB-C data cable** between the Pi and the target Windows machine so Windows re-enumerates the HID device.

---

## Deploying Updates

After the initial provisioning, subsequent code updates are fast:

```bash
# Deploy to Pi (builds frontend, rsyncs, restarts service)
PI_HOST=192.168.0.42 ./deploy.sh
```

For password auth:
```bash
PI_HOST=192.168.0.42 PI_PASS=191996 ./deploy.sh
```

Or create a `.env.deploy` file (gitignored):
```
PI_PASS=191996
PI_HOST=192.168.0.42
```

The deploy script:
1. Runs `npm run build` in the frontend directory
2. Rsyncs all files to the Pi
3. Restarts `guidenco.service` via systemd (which also re-runs `setup_hid_gadget.sh`)

---

## Restarting the Service on Pi

```bash
ssh ronnel@192.168.0.42 "sudo systemctl restart guidenco.service"

# Check status
ssh ronnel@192.168.0.42 "sudo systemctl status guidenco.service"

# View live logs
ssh ronnel@192.168.0.42 "sudo journalctl -u guidenco.service -f"
```

---

## Running Locally (Development)

### Frontend

```bash
cd frontend
npm install
npm run dev        # Dev server with HMR
npm run build      # Production build to frontend/dist/
```

### Backend

```bash
# Set the VLM API key (required)
export OLLAMA_API_KEY="your-key-here"

# Optional: override model / endpoint
# export GUIDENCO_MODEL="qwen3-vl:235b-instruct-cloud"
# export OLLAMA_BASE_URL="https://ollama.com/v1"

# Direct Flask (development)
sudo -E python3 server.py --port 5000 --debug

# Production via Gunicorn
sudo -E python3 server.py --port 5000

# CLI (headless, no web server)
sudo -E python3 -m agent "Open notepad and type hello"
```

Use `sudo -E` to preserve `OLLAMA_API_KEY`. For the systemd unit, add:

```ini
Environment=OLLAMA_API_KEY=your-key-here
```

> **Note:** LLM provider, model, API key, agent timeout, and network settings are
> primarily configured at runtime via `settings.json` (editable from the Settings
> panel in the web UI). The `OLLAMA_API_KEY` / `GUIDENCO_MODEL` environment
> variables are only used as a fallback when the matching `settings.json` field is
> empty.

---

## USB HID Design

The Pi emulates two independent USB HID gadget interfaces:

- **`/dev/hidg0` — Keyboard** (8 bytes): Boot keyboard layout with modifier byte + 6-key rollover.
- **`/dev/hidg1` — Absolute Mouse** (5 bytes): 3 button bits + 16-bit X (0–32767) + 16-bit Y (0–32767).

The mouse report layout matches a standard absolute pointer report and has no wheel field. Scrolling is emulated by sending PageUp/PageDown key presses on the keyboard interface. This design prevents compatibility issues where absolute cursor placement conflicts with scroll input.

The HID gadget configuration is handled by `setup_hid_gadget.sh` on the Pi, running as a systemd `ExecStartPre` script. It always force-recreates the gadget on boot so descriptor changes take effect without manual intervention.

---

## Development Notes

- The frontend is a React app built with Vite, served as static files from `frontend/dist/` by Flask
- The agent logs structured events using Python's logging library; visualizations are prefixed with `__GUIDENCO_VIZ__` and captured via a thread-safe SSEHandler filter on the worker thread
- Coordinate space: X and Y are 1–1000, mapped directly to HID absolute values (0–32767) without any pixel intermediate
- The capture card manager runs a persistent ffmpeg process, publishing frames to subscriber queues
- The `_unpack_xy()` and `_unpack_amount()` helpers in `agent/actions.py` handle VLM quirks where coordinates may be returned as arrays