# guidenco

A Raspberry Pi that sits between a machine and its monitor, captures that
machine's HDMI output, and presents itself to it as a USB keyboard and mouse.
Both are exposed as an MCP server, so Claude can drive the machine directly.

Nothing is installed on the target and nothing runs on it. It sees an ordinary
USB keyboard and mouse and an ordinary monitor. So this works on a machine you
cannot log into, during boot, at a BIOS screen, or on an OS with no remote
access software at all.

```
┌────────────┐   HDMI    ┌──────────────┐   MCP :8080  ┌──────────────┐
│   target   │──────────▶│              │◀────────────▶│    Claude    │
│  machine   │           │  Raspberry   │              └──────────────┘
│            │◀──────────│     Pi       │◀─ Bluetooth ─  setup page
└────────────┘  USB HID  └──────────────┘   (wifi, URL)
```

## Install

Flash Raspberry Pi OS, enable SSH, sign in, and run:

```bash
curl -fsSL https://raw.githubusercontent.com/onvo-ai/guidenco/main/install.sh | sudo bash
```

The installer detects the capture hardware, sets the boot overlays it needs,
generates an API token, installs the service and starts it, then prints the URLs
and the token. A reboot is required the first time, because the USB gadget
overlay only takes effect at boot. Re-running it updates an existing install in
place and keeps the token and any settings you have changed.

It fetches the code itself, so there is nothing to clone first. From a checkout
it uses the files next to it instead:

```bash
git clone https://github.com/onvo-ai/guidenco
cd guidenco && sudo ./install.sh
```

Set `GUIDENCO_REF` to install something other than `main` — a branch or a tag.

The Bluetooth setup page for Wi-Fi and the public URL is at
<https://onvo-ai.github.io/guidenco/>, and needs Chrome or Edge.

## Connecting Claude

```bash
claude mcp add --transport http guidenco http://<pi>:8080/mcp \
  --header "Authorization: Bearer $TOKEN"
```

The token is printed by `install.sh` and lives in `/etc/guidenco/config.env`.
The repository also carries a skill in `skill/guidenco/` covering the
screenshot-act-verify loop and what to check when the bridge misbehaves.

### Tools

| Tool | |
|---|---|
| `screenshot` | what the target is displaying, as an image |
| `get_status` | screen size, input availability, network |
| `move_mouse` | `{x, y}` |
| `click` | `{x, y, button?, count?}` |
| `drag` | `{from_x, from_y, to_x, to_y}` |
| `scroll` | `{x, y, amount}` — signed notches |
| `type_text` | `{text}` |
| `press_key` | `{key}` — `"Return"`, `"ctrl+c"`, `"cmd+shift+4"` |
| `batch` | `{actions}` — run several of the above in one call, with optional `wait` steps |

Coordinates are **pixels in the screenshot**, origin top-left. Read a position
off the image and pass it back unchanged — including when the image is
letterboxed, which the bridge detects and corrects for on its own.

Every action is a network round trip, so two options exist to avoid paying for
one needlessly. `batch` runs a list of actions in a single call — a sequence of
strokes, a form, a menu path — and stops at the first failure, reporting how far
it got. Include `{"action": "wait", "seconds": n}` wherever something has to
appear before the next step can land: a launcher, a menu, a dialog.

Any action also takes `return_frame: true`, which hands back a screenshot taken
after it, so seeing the result costs nothing extra. It pauses `ACTION_SETTLE_MS`
first, because an action returns as soon as the HID report is written — well
before the target has redrawn — and a frame taken at that moment shows the old
screen and reads as though nothing happened. Pass `settle_ms` to wait longer for
an application that is slow to react.

Both assume the screen has not moved somewhere you have not seen, so do not plan
past a point where it might.

### Read-only HTTP

Alongside MCP there are three GET endpoints, for when you want to look without
an MCP client:

```bash
curl -s http://<pi>:8080/health     -H "Authorization: Bearer $TOKEN"
curl -s http://<pi>:8080/screenshot -H "Authorization: Bearer $TOKEN" -o screen.jpg
open      http://<pi>:8080/stream   # live MJPEG, plays in any browser
```

`GET /openapi.json` describes those three and needs no token. Actions are not
duplicated there — an MCP client asks the server for its tools, and two
descriptions of the same thing would eventually disagree.

## Public access

`cloudflared` is installed by the installer. Set `TUNNEL_ENABLED=on` and restart,
and the bridge gets a `trycloudflare.com` hostname reachable from anywhere:

```bash
claude mcp add --transport http guidenco https://<random>.trycloudflare.com/mcp \
  --header "Authorization: Bearer $TOKEN"
```

Two things to know. The hostname is **new every restart**, which is what the
Bluetooth setup page is for. And the service **refuses to open a tunnel while
`API_TOKEN` is empty** — a public URL to an unauthenticated bridge would hand
keyboard and mouse control of the target to anyone who found it.

## Setup over Bluetooth

Getting the Pi onto Wi-Fi normally needs the Pi to already be on Wi-Fi. It
advertises a BLE service instead, so a browser can configure it with no network
at all — and read the current tunnel URL, which otherwise there is no way to
learn.

Host `web/index.html` anywhere with HTTPS (GitHub Pages works), open it, and
connect. It can set Wi-Fi credentials and shows the live status and tunnel URL.

**Chrome or Edge only.** Web Bluetooth does not exist in Safari or Firefox, and
no browser on iOS has it. The Wi-Fi password is write-only over BLE and is never
readable afterwards.

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

`type_text` sends a string; `press_key` sends one key or combination. Modifiers join with
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
if you hit this, and `get_status` reports `input.available: false`.

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
| `STREAM_FPS` | `10` | capture frame rate, enforced as a real cap |
| `CAPTURE_IDLE_TIMEOUT_S` | `300` | how long the pipeline stays warm after the last request |
| `CAPTURE_WARMUP_S` | `20` | how long to wait for a frame, covering a cold start |
| `ACTION_SETTLE_MS` | `400` | pause before a `return_frame` screenshot, so the target has redrawn |
| `API_PORT` | `8080` | |
| `API_TOKEN` | generated | blank disables authentication entirely |
| `HID_ENABLED` | `auto` | `auto`, `on` (missing gadget is an error), `off` |
| `MOUSE_SMOOTH` | `on` | `off` for instant pointer jumps |
| `TUNNEL_ENABLED` | `off` | `on` publishes a public Cloudflare URL |
| `BLE_ENABLED` | `on` | Bluetooth setup service |
| `BLE_NAME` | `guidenco` | how it appears in the browser's pairing dialog |

Re-running the installer keeps an existing config and adds any keys it is
missing, so an upgrade never silently falls back to defaults you did not choose.

### Security

Anything that can reach this port can type on and click the target machine. The
installer generates a token for that reason; clearing `API_TOKEN` disables
authentication completely.

On the LAN the token travels in plain HTTP, so treat that as a trusted-network
service — or reach it over SSH instead:

```bash
ssh -L 8080:localhost:8080 pi@<pi>
```

The Cloudflare tunnel is HTTPS end to end, so the token is not exposed in
transit there. It does put the bridge on the public internet, which is why a
token is mandatory for it.

`/` and `/openapi.json` stay readable without a token so an agent can discover
the API before it has credentials. Neither reveals anything about the target.

## How it works

```
capture/   ffmpeg reads the capture device and keeps the latest JPEG,
           restarting itself if the HDMI signal drops or changes resolution.
           letterbox.py finds the screen within the frame when the source's
           aspect ratio differs from the capture device's. edid.py builds the
           EDID a CSI adapter advertises, so the checksums are computed rather
           than pasted.
api/       the MCP endpoint, the read-only routes, the Cloudflare tunnel,
           and network detection.
ble/       the Bluetooth setup service. service.py holds the behaviour and has
           no D-Bus in it; bluez.py is the BlueZ plumbing, so the logic stays
           testable on a machine with no Bluetooth.
hid/       turns intent into USB HID reports, including the eased motion.
skill/     a Claude skill describing how to use the bridge well.
web/       the Web Bluetooth setup page. Host it separately.
```

**The HDMI link is negotiated at startup, before any of that.** A CSI adapter
has no EDID of its own, and a machine plugged into one that has not advertised
EDID sees no monitor at all and never enables its output. So the EDID goes out
when the service starts rather than when the first screenshot is asked for —
otherwise you connect the cable, nothing happens, and there is nothing to see
in the logs. `/health` reports whether it went out and whether a signal came
back, which is the difference between "nobody has asked for a frame yet" and
"there is no cable".

The EDID itself is generated by `capture/edid.py` and written to
`/etc/guidenco/edid_1080p30.hex` at install. It deliberately does not advertise
1080p60: the Pi Zero 2 W wires two CSI lanes to the adapter, which carries
1080p30 and not 1080p60, so a source allowed to choose the faster mode sends a
signal that cannot be carried.

**Capture runs only while something is reading it.** Ask for a screenshot and
the pipeline starts, stays warm for `CAPTURE_IDLE_TIMEOUT_S`, then shuts down.
That is partly cost — a CSI adapter delivers raw frames, so a Pi Zero would
otherwise hold three of its four cores compressing images nobody reads — and
mostly freshness: a background pipeline hands you whichever frame last landed,
while an on-demand one returns an image captured *after* you asked, which is
what "what is on screen now" has to mean if the next thing you do is click on
it.

`STREAM_FPS` is enforced with an ffmpeg `fps` filter. Passing `-framerate` on a
rawvideo input only declares what the input is; without the filter ffmpeg
encodes every frame the device produces, at the source's rate, regardless.

**Coordinates are measured against the screen, not the frame.** A capture card
delivers its own fixed resolution, so a 1512x982 desktop mirrored to a 1080p
card arrives as 1662x1080 of picture with 128px black bars either side. Pointer
position reaches the target as a fraction of *its* screen, so measuring across
the whole frame puts every click off by up to a bar-width — zero error at the
centre, growing towards the edges, which is the worst shape a bug can have:
it looks like it works. ffmpeg's cropdetect finds the real area on a single
frame at startup and once a minute after, never per frame.

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

The suite covers the MCP protocol on the wire, the read-only routes, auth, the
motion curve and key parsing, using a fake HID sink that records every report.
It speaks MCP over a real socket rather than calling handlers directly, so the
transport requirements — status codes, session headers, Origin checks — are
genuinely exercised.

Two checks run separately, so the suite itself stays dependency-free: the served
OpenAPI document against `openapi-spec-validator`, and the MCP endpoint against
the official `mcp` SDK client.

## Troubleshooting

```bash
journalctl -u guidenco -f          # what the service is doing
curl -s localhost:8080/health -H "Authorization: Bearer $TOKEN"
v4l2-ctl --list-devices            # is the capture device there
ls /dev/hidg*                      # is the HID gadget bound
```

**Screenshots fail, or `/screenshot` returns 503.** No frame has been captured. Check the HDMI source
is connected and powered. For the CSI adapter the log says whether it latched DV
timings; the EDID is capped at 1080p30 deliberately, because 1080p60 needs more
CSI lanes than a Pi Zero 2 W has.

**Actions report that input is unavailable.** The HID gadget is not bound, and
`get_status` explains why in `input.detail`. On a Pi Zero with a USB capture card that is expected.
Otherwise confirm `dtoverlay=dwc2,dr_mode=peripheral` is in `config.txt` under
`[all]` and that you rebooted — stock images put `dwc2` under `[cm4]`/`[cm5]`
filters that never apply to a Model B. Check the USB cable to the target carries
data rather than only power.

**Clicks land in the wrong place.** Check `active_area` in `get_status`. A
capture device delivers its own fixed resolution, so a source with a different
aspect ratio arrives letterboxed, and the frame is bigger than the screen inside
it. That is detected automatically and corrected for, but the detection can be
fooled by a screen that is genuinely almost entirely black, in which case it
falls back to treating the whole frame as the screen. Capturing only one screen
of an extended desktop breaks the correspondence in a way nothing can detect.

**Input stops after the target sleeps.** The service re-binds the gadget to wake
the host, which works on most machines. If it does not, the target's USB wake
setting is off.
