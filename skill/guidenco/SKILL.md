---
name: guidenco
description: Use when controlling a physical machine through a guidenco bridge — a Raspberry Pi wired between that machine and its monitor, captured over HDMI and driven as a USB keyboard and mouse. Triggers include "control the PC", "click on the screen", "what's on the target machine", "type this on the computer", "the bridge", "guidenco", or any request to operate a machine you have no software access to. Covers connecting the MCP server, the screenshot-act-verify loop, and diagnosing a bridge that is not responding.
---

# Controlling a machine through guidenco

A Raspberry Pi sits between a target machine and its monitor. It captures HDMI
output and presents itself to the target as a USB keyboard and mouse.

Nothing runs on the target. There is no filesystem access, no shell, no API into
it. **The screen is the only source of truth**, and the keyboard and mouse are
the only way to act. That makes this work on a machine you cannot log into,
during boot, at a BIOS prompt, or on an OS with no remote access — and it means
you must verify everything visually.

## Connecting

The bridge serves MCP over HTTP. Add it once:

```bash
claude mcp add --transport http guidenco http://<pi-address>:8080/mcp \
  --header "Authorization: Bearer $GUIDENCO_TOKEN"
```

The token is printed by `install.sh` and stored in `/etc/guidenco/config.env` on
the Pi. If the bridge is running a Cloudflare tunnel, use the tunnel URL instead
and it will work from anywhere — but **that URL changes every time the bridge
restarts**. Read the current one from the Bluetooth setup page, or from
`GET /health` if you can still reach the Pi directly.

Check it is alive before assuming a problem is yours:

```bash
curl -s http://<pi-address>:8080/health -H "Authorization: Bearer $GUIDENCO_TOKEN"
```

## The loop

Always: **screenshot → decide → act → screenshot again**.

1. `screenshot` to see the current state.
2. Work out the coordinates from that image. They are plain pixels, origin
   top-left, in the image you were just given.
3. Act — `click`, `type_text`, `press_key`, `scroll`, `drag`.
4. `screenshot` again to confirm it did what you expected.

Never assume an action landed. A click can miss, a window can steal focus, a
dialog can appear. The only way to know is to look.

Leave a moment between acting and re-screenshotting when the target needs time —
an application launching, a page loading. If the screen looks unchanged, take
another screenshot before concluding the action failed.

Step 4 has a shortcut: pass `return_frame: true` on any action and it hands back
the screenshot itself, so the loop costs one call instead of two. Prefer it
whenever the next thing you would do is look. It already pauses briefly so the
target has time to redraw; if an application is slow — a big app launching, a
theme downloading — pass `settle_ms` up to 5000 rather than believing a frame
that shows nothing happened.

When several actions are already decided — a run of strokes, filling a form,
walking a menu — send them as one `batch` instead of one call each. It stops at
the first failure and tells you how far it got. Put
`{"action": "wait", "seconds": n}` between steps wherever something has to
appear first: opening a launcher then typing into it needs a pause, or the
typing lands on the desktop. Do not batch past a point where the screen changes
in a way you have not seen: every coordinate in the batch is read from the
screenshot you took before it.

## Things that catch people out

**Typing goes to whatever has focus.** `type_text` does not target a field. Click
the field first, screenshot to confirm the caret is there, then type.

**The keyboard is a US layout.** HID sends scan codes and the target decides what
they mean. If the target is set to another layout, punctuation will differ.
Characters with no mapping are skipped, and the tool tells you which.

**Use `press_key` for anything that is not literal text** — `Return`, `Tab`,
`Escape`, and shortcuts like `ctrl+c` or `cmd+shift+4`. `type_text` sends
characters, not keystrokes.

**Pointer moves are eased on purpose.** They take a couple of hundred
milliseconds because applications need to observe motion to fire hover states
and to recognise a drag. Pass `smooth: false` only when you are doing something
repetitive and do not care.

**Coordinates are in the screenshot's space, not the target's.** These are
normally the same. They diverge if the target mirrors a display of a different
shape, has overscan, or has an extended desktop where you only see one screen.
If clicks land consistently offset, that is the cause — say so rather than
compensating by guesswork.

## When it does not respond

Call `get_status` first. It answers most questions directly:

- `input.available: false` — the USB HID gadget is not bound, so you can see the
  screen but cannot act. `input.detail` says why. On a Pi Zero with a USB capture
  card this is expected and unfixable: its single USB port cannot be both a HID
  gadget and a capture-card host.
- `screen.ready: false` — no frame has been captured. The HDMI source is
  disconnected, powered off, or asleep. Nothing you do through this bridge will
  fix it; the user has to check the cable.
- `network` — which network the bridge is on, and the Wi-Fi signal. A weak signal
  explains slow screenshots.

If the target machine is asleep, the bridge tries to wake it by re-binding the
gadget. That works on most machines. If it does not, the user has to wake it.

## Setup over Bluetooth

If the Pi cannot reach the network at all, it advertises a BLE service named
`guidenco` for configuration. The user opens the setup page in **Chrome or Edge**
— Safari and Firefox have no Web Bluetooth — and can set Wi-Fi credentials and
read the current tunnel URL without the Pi being on any network.

You cannot do this yourself; it needs a browser and a user gesture to pair. Tell
the user to open the page if the bridge is unreachable.
