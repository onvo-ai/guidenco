# guidenco

A Raspberry Pi that turns an HDMI output into a VNC screen, and VNC input back
into USB keyboard and mouse. Plug it between any machine and its monitor, and
that machine becomes reachable from any VNC client — or from an AI agent via
[mcp-vnc](https://github.com/hrrrsn/mcp-vnc).

The target machine needs no software installed. It sees an ordinary USB
keyboard and mouse, and its HDMI output goes to a capture device. Nothing runs
on it, and nothing is installed on it.

```
┌────────────┐   HDMI    ┌──────────────┐   TCP 5900   ┌──────────────┐
│   target   │──────────▶│              │◀────────────▶│  VNC client  │
│  machine   │           │  Raspberry   │              │  or mcp-vnc  │
│            │◀──────────│     Pi       │              └──────────────┘
└────────────┘  USB HID  └──────────────┘
```

## Hardware

Either capture path works:

- **USB HDMI capture card** — cheap, plug-and-play, needs a spare USB host port.
- **HDMI-to-CSI adapter** (Toshiba TC358743) — sits on the camera ribbon cable.

| Board | USB capture card | HDMI-to-CSI adapter |
|---|---|---|
| Pi 4 / Pi 5 | screen + input | screen + input |
| Pi Zero 2 W | **screen only** | screen + input |

A Pi Zero has one USB data port. The HID gadget needs it as a *device* port and
a capture card needs it as a *host* port, and it cannot be both. So on a Zero,
use the CSI adapter if you want to control the target; with a capture card you
get a view-only screen. The installer warns you if you hit this.

You also need a USB cable from the Pi's gadget port to the target machine, and
the Pi on its own power supply.

## Install

```bash
git clone https://github.com/onvo-ai/guidenco
cd guidenco && sudo ./install.sh
```

The installer detects the capture hardware, sets the boot overlays it needs,
installs the service and starts it. It will tell you if a reboot is required —
it is, the first time, because the overlays only take effect at boot.

Then connect any VNC client to `<pi-address>:5900`.

## Configuration

Everything lives in `/etc/guidenco/config.env`. Restart after editing:

```bash
sudo systemctl restart guidenco
```

| Key | Default | What it does |
|---|---|---|
| `CAPTURE_TYPE` | detected | `usb`, `csi`, or `test` for a synthetic pattern |
| `VIDEO_DEV` | detected | capture device node |
| `STREAM_W` / `STREAM_H` | `0` | served screen size; `0` means native resolution |
| `STREAM_FPS` | `10` | capture frame rate |
| `VNC_PORT` | `5900` | listening port |
| `VNC_PASSWORD` | *empty* | empty means **no authentication** |
| `VNC_MAX_CLIENTS` | `4` | concurrent viewers |
| `HID_ENABLED` | `auto` | `auto`, `on` (missing gadget is an error), `off` (screen only) |

### Security

With `VNC_PASSWORD` empty, anyone who can reach port 5900 has full keyboard and
mouse control of the target. Set a password, or keep the Pi on a network where
that is acceptable.

Be aware that VNC Authentication is weak by design — an 8-character key, no
transport encryption, and replayable. It is what every VNC client speaks, so it
is what this serves, but it is not a substitute for network isolation. For
anything reachable from outside your LAN, tunnel it:

```bash
ssh -L 5900:localhost:5900 pi@<pi-address>
```

## Use with Claude

Point [mcp-vnc](https://github.com/hrrrsn/mcp-vnc) at the Pi:

```json
{
  "mcpServers": {
    "vnc": {
      "command": "npx",
      "args": ["-y", "@hrrrsn/mcp-vnc"],
      "env": {
        "VNC_HOST": "192.168.1.50",
        "VNC_PORT": "5900",
        "VNC_PASSWORD": "your-password"
      }
    }
  }
}
```

## How it works

```
capture/   ffmpeg reads the capture device and emits raw BGR24 frames into a
           shared framebuffer, restarting itself if the HDMI signal drops or
           changes resolution.
rfb/       the VNC server: RFB 3.8 handshake, VNC Auth, ZRLE and Raw encoding,
           and a keysym-to-HID-usage table.
hid/       turns VNC pointer and key events into USB HID reports.
```

Two details are worth knowing if you touch the code:

**Frames are BGR24, not RGB.** That is the byte order most VNC servers
advertise and the one clients are best tested against, and it is byte-for-byte
what a ZRLE `CPIXEL` needs — so encoding is a memory slice with no per-pixel
work. Notably, nodejs-rfb (which mcp-vnc uses) hardcodes a BGR-to-RGBA swap and
ignores the channel shifts a server negotiates, so serving RGB would come out
with red and blue swapped in every screenshot.

**Change detection works on 64-row bands, not tiles.** A band spans the full
width, so it is contiguous in memory and diffing a whole 1080p frame is 17
buffer comparisons rather than several hundred strided ones. Adjacent changed
bands merge into one rectangle before encoding.

There is no JPEG anywhere, because nodejs-rfb does not implement the Tight
encoding. ZRLE over zlib is the best compression every relevant client shares.

### Performance

Measured at 1080p on an Apple M-series laptop, encoding a synthetic desktop
(flat background, a window of dense text):

| | time | on the wire |
|---|---|---|
| Idle frame, nothing changed | ~0 ms | nothing |
| One 64-row band changed | 0.5 ms | 9 KB |
| Whole screen redrawn | 11 ms | 63 KB |
| Whole screen, incompressible noise | 120 ms | 6 MB |

A Pi Zero 2 W is roughly an order of magnitude slower per core, so expect a
full redraw in the low hundreds of milliseconds and an idle screen to stay
near-free. **These Pi figures are extrapolated, not measured** — the numbers
above come from a laptop, and nobody has run this on real hardware yet.

The idle case is the one that matters most, because every captured frame is
diffed whether or not anyone is watching. That check is a single memcmp over
the frame, which is why holding pixels as `bytes` rather than a `memoryview`
matters so much: the same comparison through a memoryview measured 23 ms per
frame, enough to saturate a Pi Zero core at 10 fps on its own.

## Development

There are no dependencies — Python standard library only. The synthetic capture
backend means the whole thing runs on a laptop with no Pi and no ffmpeg:

```bash
CAPTURE_TYPE=test STREAM_W=640 STREAM_H=480 python3 main.py
```

```bash
python3 -m unittest discover -s tests -t . -v
```

The tests include an independent RFB client that decodes ZRLE, so a round trip
is checked against real bytes rather than against the server's own encoder.

## Troubleshooting

```bash
journalctl -u guidenco -f          # what the service is doing
v4l2-ctl --list-devices            # is the capture device there
ls /dev/hidg*                      # is the HID gadget bound
```

**No frames.** Check the capture device appears in `v4l2-ctl --list-devices`.
For the CSI adapter the log will say whether it latched DV timings — if not, the
source is not sending a signal it accepts. The EDID is capped at 1080p30
deliberately, because 1080p60 needs more CSI lanes than a Pi Zero 2 W has.

**Screen works, input does nothing.** `ls /dev/hidg*` — if they are missing, the
gadget did not bind. On a Pi Zero with a USB capture card, that is expected (see
Hardware above). Otherwise confirm `dtoverlay=dwc2,dr_mode=peripheral` is in
`config.txt` under `[all]` and that you rebooted, and that the USB cable to the
target is a data cable rather than charge-only.

**Input stops after the target sleeps.** The service re-binds the gadget to wake
the host, which works on most machines. If it does not, the target's USB wake
setting is off.
