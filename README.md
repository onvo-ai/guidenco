# guidenco

A Raspberry Pi that sits between a machine and its monitor, captures that
machine's HDMI output, and presents itself to it as a USB keyboard and mouse.
Both are exposed over a small HTTP API with an OpenAPI spec, so an agent can be
pointed at the base URL and discover everything else.

Nothing is installed on the target and nothing runs on it. It sees an ordinary
USB keyboard and mouse and an ordinary monitor. So this works on a machine you
cannot log into, during boot, at a BIOS screen, or on an OS with no remote
access software at all.

```
┌────────────┐   HDMI    ┌──────────────┐   HTTP 8080  ┌──────────────┐
│   target   │──────────▶│              │◀────────────▶│  agent, or   │
│  machine   │           │  Raspberry   │              │  curl, or a  │
│            │◀──────────│     Pi       │              │  browser     │
└────────────┘  USB HID  └──────────────┘              └──────────────┘
```

## Install

```bash
git clone https://github.com/onvo-ai/guidenco
cd guidenco && sudo ./install.sh
```

The installer detects the capture hardware, sets the boot overlays it needs,
generates an API token, installs the service and starts it, then prints the URLs
and the token. A reboot is required the first time, because the USB gadget
overlay only takes effect at boot.

## Using it

Everything is discoverable from the base URL:

```bash
curl http://<pi>:8080/openapi.json
```

| Method | Path | |
|---|---|---|
| GET | `/openapi.json` | the whole API — **no token needed** |
| GET | `/health` | screen size, input availability, network |
| GET | `/screenshot` | the target's screen right now, JPEG |
| GET | `/stream` | MJPEG stream; open it in a browser to watch |
| POST | `/move` | `{x, y}` |
| POST | `/click` | `{x, y, button?, count?}` |
| POST | `/drag` | `{from_x, from_y, to_x, to_y}` |
| POST | `/scroll` | `{x, y, amount}` — signed notches |
| POST | `/type` | `{text}` |
| POST | `/key` | `{key}` — `"Return"`, `"ctrl+c"`, `"cmd+shift+4"` |

```bash
TOKEN=...   # printed by install.sh, stored in /etc/guidenco/config.env
curl -s http://<pi>:8080/screenshot -H "Authorization: Bearer $TOKEN" -o screen.jpg
curl -s -X POST http://<pi>:8080/click -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' -d '{"x": 840, "y": 460}'
```

Coordinates are **pixels in the screenshot's own space**, so read a position off
the image and post it back unchanged. `/health` reports the dimensions, and
`/screenshot` returns them in `X-Screen-Width` and `X-Screen-Height`.

### Pointer motion

Moves are interpolated with ease-in-out rather than teleporting. This is
functional, not decorative: a cursor that jumps never crosses the pixels in
between, so hover states never fire, menus that open on hover stay shut, and
drag-and-drop frequently fails because applications decide a drag has begun by
watching for motion while a button is held.

Duration scales with the square root of distance, Fitts-style — a 70 px nudge
takes about 200 ms, a full-screen sweep caps at 600 ms. Pass `{"smooth": false}`
on any action for an instant jump, or set `MOUSE_SMOOTH=off` to make that the
default.

### Keyboard

`/type` sends a string; `/key` sends one key or combination. Modifiers join with
`+`: `ctrl`, `shift`, `alt` (`option`), `cmd` (`command`, `super`, `win`,
`meta`). Named keys include `Return`, `Escape`, `Tab`, `Backspace`, `Delete`,
`Home`, `End`, `PageUp`, `PageDown`, the arrows and `F1`–`F24`.

This is a **US layout**. HID sends scan codes and the target decides what they
mean, so a target set to another layout produces different punctuation.
Characters with no mapping are skipped and listed in the response rather than
failing the whole string.

## Hardware

Either capture path works:

- **USB HDMI capture card** — cheap, plug and play, needs a spare USB host port.
- **HDMI-to-CSI adapter** (Toshiba TC358743) — sits on the camera ribbon cable.

| Board | USB capture card | HDMI-to-CSI adapter |
|---|---|---|
| Pi 4 / Pi 5 | screen + input | screen + input |
| Pi Zero 2 W | **screen only** | screen + input |

A Pi Zero has one USB data port. The HID gadget needs it as a *device* port and
a capture card needs it as a *host* port, and it cannot be both. So on a Zero,
use the CSI adapter if you want to control the target. The installer warns you
if you hit this, and `/health` reports `input.available: false`.

You also need a USB cable from the Pi's gadget port to the target, and the Pi on
its own power supply. On a Pi 4 the USB-C port carries both, so the target can
power it.

## Configuration

`/etc/guidenco/config.env`. Restart after editing:

```bash
sudo systemctl restart guidenco
```

| Key | Default | |
|---|---|---|
| `CAPTURE_TYPE` | detected | `usb`, `csi`, or `test` for a synthetic pattern |
| `VIDEO_DEV` | detected | capture device node |
| `STREAM_W` / `STREAM_H` | `0` | `0` keeps the native size **and enables JPEG passthrough** |
| `CAPTURE_MAX_W` / `_H` | `1920` / `1080` | ceiling on the probed capture mode |
| `STREAM_FPS` | `10` | capture frame rate |
| `API_PORT` | `8080` | |
| `API_TOKEN` | generated | blank disables authentication entirely |
| `HID_ENABLED` | `auto` | `auto`, `on` (missing gadget is an error), `off` |
| `MOUSE_SMOOTH` | `on` | `off` for instant pointer jumps |

Re-running the installer keeps an existing config and adds any keys it is
missing, so an upgrade never silently falls back to defaults you did not choose.

### Security

Anything that can reach this port can type on and click the target machine. The
installer generates a token for that reason; clearing `API_TOKEN` disables
authentication completely.

The token travels in plain HTTP, so treat this as a trusted-LAN service. For
anything reachable from further away, tunnel it:

```bash
ssh -L 8080:localhost:8080 pi@<pi>
```

`/` and `/openapi.json` stay readable without a token so an agent can discover
the API before it has credentials. Neither reveals anything about the target.

## How it works

```
capture/   ffmpeg reads the capture device and keeps the latest JPEG,
           restarting itself if the HDMI signal drops or changes resolution.
api/       the HTTP surface, the served OpenAPI spec, and network detection.
hid/       turns intent into USB HID reports, including the eased motion.
```

**Frames are never decoded.** A USB capture card already emits MJPEG, so ffmpeg
copies frames through with `-c:v copy` — no decode, no scale, no re-encode. The
service sits near 0% CPU while capturing, and a screenshot is a memory read.
Setting `STREAM_W`/`STREAM_H` forces a re-encode and gives that up. The CSI
adapter is the one path that must encode, since the TC358743 emits raw UYVY.

That passthrough is why this API replaced an earlier VNC server. VNC clients
could not accept JPEG — the common client library implements only Raw, CopyRect,
Hextile and ZRLE, no Tight — so every frame had to be decoded to raw pixels and
re-encoded as ZRLE, about 47 ms of Pi 4 CPU per frame. Worse, lossy MJPEG
re-encode noise meant no two frames were ever byte-identical, so change
detection never stabilised and the whole screen was resent continuously. Serving
the card's own JPEG removes all of it.

## Development

No dependencies — Python standard library only. The synthetic capture backend
means the whole thing runs on a laptop with no Pi and no ffmpeg:

```bash
CAPTURE_TYPE=test API_PORT=8080 python3 main.py
```

```bash
python3 -m unittest discover -s tests -t . -v
```

The suite covers the HTTP surface, auth, the motion curve, key parsing and the
served spec, using a fake HID sink that records every report. The spec is also
checked against `openapi-spec-validator` separately, since the suite itself
stays dependency-free.

## Troubleshooting

```bash
journalctl -u guidenco -f          # what the service is doing
curl -s localhost:8080/health -H "Authorization: Bearer $TOKEN"
v4l2-ctl --list-devices            # is the capture device there
ls /dev/hidg*                      # is the HID gadget bound
```

**`/screenshot` returns 503.** No frame has been captured. Check the HDMI source
is connected and powered. For the CSI adapter the log says whether it latched DV
timings; the EDID is capped at 1080p30 deliberately, because 1080p60 needs more
CSI lanes than a Pi Zero 2 W has.

**Actions return 503.** The HID gadget is not bound, and `/health` explains why
in `input.detail`. On a Pi Zero with a USB capture card that is expected.
Otherwise confirm `dtoverlay=dwc2,dr_mode=peripheral` is in `config.txt` under
`[all]` and that you rebooted — stock images put `dwc2` under `[cm4]`/`[cm5]`
filters that never apply to a Model B. Check the USB cable to the target carries
data rather than only power.

**Clicks land in the wrong place.** The pointer is positioned as a fraction of
the target's screen, so the captured image has to correspond to the whole
desktop. Mirroring a display of a different aspect ratio, overscan, and
capturing one screen of an extended desktop all break that correspondence.

**Input stops after the target sleeps.** The service re-binds the gadget to wake
the host, which works on most machines. If it does not, the target's USB wake
setting is off.
