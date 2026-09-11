#!/usr/bin/env bash
# guidenco installer — Raspberry Pi OS / Ubuntu Server, Pi Zero 2 W through Pi 5.
#
#   git clone https://github.com/onvo-ai/guidenco
#   cd guidenco && sudo ./install.sh
#
# Detects the capture hardware, configures the boot overlays it needs, installs
# the service, and starts it. Re-running is safe: it updates in place.

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[guidenco]${NC} $*"; }
warn()  { echo -e "${YELLOW}[guidenco] WARN:${NC} $*"; }
error() { echo -e "${RED}[guidenco] ERROR:${NC} $*" >&2; exit 1; }

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR=/opt/guidenco
CONFIG_DIR=/etc/guidenco
CONFIG_FILE="$CONFIG_DIR/config.env"

[[ $EUID -eq 0 ]] || error "run with sudo"

# ── 1. System packages ────────────────────────────────────────────────────────
# ffmpeg and v4l-utils drive the capture device; python3 runs the service. There
# are no Python dependencies at all, so no pip, no venv and no compiler.
info "Installing system packages..."
apt-get update -q -y
# usbutils and psmisc are NOT on a minimal Ubuntu Server image, and both are
# used below — without usbutils, capture detection silently guesses wrong.
apt-get install -y -q --no-install-recommends python3 ffmpeg v4l-utils usbutils psmisc

# Ubuntu's Pi images keep dwc2 and libcomposite in a separate package that the
# server image does not always pull in. Without them there is no USB gadget.
if ! modinfo libcomposite >/dev/null 2>&1 || ! modinfo dwc2 >/dev/null 2>&1; then
  if apt-cache show "linux-modules-extra-$(uname -r)" >/dev/null 2>&1; then
    info "Installing USB gadget kernel modules..."
    apt-get install -y -q "linux-modules-extra-$(uname -r)" || \
      warn "could not install linux-modules-extra-$(uname -r); USB HID may not work"
  else
    warn "libcomposite/dwc2 not found and no matching linux-modules-extra package"
  fi
fi

# ── 2. Hardware detection ─────────────────────────────────────────────────────
pi_model() { tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo "unknown"; }

detect_capture_type() {
  # Ask the capture device itself how it is attached, rather than matching a
  # list of vendor IDs that will always be incomplete. v4l2 reports "usb-..."
  # in Bus info for a UVC capture card and "platform:..." for a CSI adapter.
  for dev in /dev/video*; do
    [[ -e "$dev" ]] || continue
    # "|| true" matters: under set -e a failing v4l2-ctl would abort the
    # installer instead of moving on to the next device node.
    local probe=""
    probe="$(v4l2-ctl -d "$dev" --info 2>/dev/null || true)"
    grep -q "Video Capture" <<<"$probe" || continue
    if grep -qi "Bus info.*usb" <<<"$probe"; then echo usb; return; fi
    if grep -qi "tc358743\|unicam\|platform" <<<"$probe"; then echo csi; return; fi
  done

  # No usable /dev/video yet. A CSI adapter has no node until its overlay is
  # enabled and the Pi has rebooted, so fall back to the USB bus: if a known
  # capture chipset is plugged in it is a card, otherwise assume CSI.
  if lsusb 2>/dev/null | grep -qiE '534d:|1b71:|eb1a:|345f:|1e4e:|05e1:'; then
    echo usb
  else
    echo csi
  fi
}

detect_video_dev() {
  # Pick a node that can actually hand us frames. Checking the capability
  # strings is not enough: uvcvideo exposes a metadata node alongside the real
  # one (often as the LOWER number, e.g. video0 metadata + video1 capture) and
  # both advertise the driver's combined capabilities. A node that can deliver
  # video is the one that lists at least one pixel format.
  for dev in /dev/video*; do
    [[ -e "$dev" ]] || continue
    local formats=""
    formats="$(v4l2-ctl -d "$dev" --list-formats 2>/dev/null || true)"
    if grep -qE "\[[0-9]+\]: '[A-Za-z0-9 ]{4}'" <<<"$formats"; then
      echo "$dev"; return
    fi
  done
  echo /dev/video0
}

MODEL="$(pi_model)"
CAPTURE_TYPE="$(detect_capture_type)"
VIDEO_DEV="$(detect_video_dev)"
info "Board:   $MODEL"
info "Capture: $CAPTURE_TYPE ($VIDEO_DEV)"

# ── 3. Boot configuration ─────────────────────────────────────────────────────
CONFIG_TXT=/boot/firmware/config.txt
[[ -f "$CONFIG_TXT" ]] || CONFIG_TXT=/boot/config.txt
[[ -f "$CONFIG_TXT" ]] || error "cannot find config.txt — is this a Raspberry Pi?"

REBOOT_NEEDED=0

if [[ "$CAPTURE_TYPE" == "csi" ]]; then
  if ! grep -q "dtoverlay=tc358743" "$CONFIG_TXT"; then
    info "Enabling the HDMI-to-CSI adapter (TC358743)..."
    printf '\n# guidenco: HDMI-to-CSI adapter\ndtoverlay=tc358743\n' >> "$CONFIG_TXT"
    REBOOT_NEEDED=1
  fi
  grep -q tc358743 /etc/modules 2>/dev/null || echo tc358743 >> /etc/modules
fi

# USB HID gadget: the Pi presents itself to the target as a keyboard and mouse,
# which needs the dwc2 controller in peripheral mode. Pi 4/5 stock configs often
# put dwc2 under a CM-only filter ([cm4]/[cm5]) that never applies to a Model B,
# so add it under [all] where it definitely takes effect.
if ! grep -qE '^\s*dtoverlay=dwc2.*dr_mode=peripheral' "$CONFIG_TXT"; then
  info "Enabling USB gadget mode (dwc2 peripheral)..."
  printf '\n# guidenco: USB HID gadget\n[all]\ndtoverlay=dwc2,dr_mode=peripheral\n' >> "$CONFIG_TXT"
  REBOOT_NEEDED=1
fi
grep -q dwc2 /etc/modules 2>/dev/null || echo dwc2 >> /etc/modules

# The one combination that cannot work: a Pi Zero has a single USB data port,
# and it cannot be a HID device and a capture-card host at the same time.
if [[ "$CAPTURE_TYPE" == "usb" && "$MODEL" == *Zero* ]]; then
  warn "This is a Pi Zero with a USB capture card."
  warn "Its single USB port is already host to the capture card, so the HID"
  warn "gadget cannot bind. You will get the screen over VNC but no mouse or"
  warn "keyboard. Use an HDMI-to-CSI adapter if you need input."
fi

# ── 4. Install ────────────────────────────────────────────────────────────────
info "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"
rm -rf "$INSTALL_DIR"/{capture,rfb,hid}
for item in main.py config.py capture rfb hid; do
  cp -r "$SOURCE_DIR/$item" "$INSTALL_DIR/"
done
install -m 755 "$SOURCE_DIR/hid-gadget-setup.sh" /usr/local/bin/guidenco-hid-setup

# ── 5. Configuration ──────────────────────────────────────────────────────────
# Written once and never overwritten, so re-running the installer does not throw
# away a password or a tuned resolution.
if [[ ! -f "$CONFIG_FILE" ]]; then
  info "Writing $CONFIG_FILE"
  cat > "$CONFIG_FILE" <<EOF
# guidenco VNC bridge configuration. Restart after editing:
#   sudo systemctl restart guidenco

# Capture hardware — "usb", "csi", or "test" for a synthetic pattern.
CAPTURE_TYPE=$CAPTURE_TYPE
VIDEO_DEV=$VIDEO_DEV

# Served screen size. 0 means native resolution, which gives the sharpest text.
# Set both (e.g. 1280 and 720) if a Pi Zero cannot keep up at 1080p.
STREAM_W=0
STREAM_H=0
STREAM_FPS=10

# VNC. Leave VNC_PASSWORD empty to run with no authentication — only sensible
# on a network you fully trust, since anyone who reaches port 5900 gets control.
VNC_PORT=5900
VNC_PASSWORD=
VNC_MAX_CLIENTS=4

# Input replay: "auto" uses the USB HID gadget when it is present, "off" serves
# the screen read-only, "on" makes a missing gadget a loud error.
HID_ENABLED=auto
EOF
  chmod 600 "$CONFIG_FILE"
else
  info "Keeping existing $CONFIG_FILE"
fi

# ── 6. Service ────────────────────────────────────────────────────────────────
info "Installing systemd service..."
cp "$SOURCE_DIR/guidenco.service" /etc/systemd/system/guidenco.service
systemctl daemon-reload
systemctl enable guidenco.service >/dev/null

if [[ $REBOOT_NEEDED -eq 1 ]]; then
  warn "Boot configuration changed — reboot before the service will work:"
  warn "    sudo reboot"
else
  systemctl restart guidenco.service
  sleep 2
  systemctl is-active --quiet guidenco.service \
    && info "Service running." \
    || warn "Service did not start. Check: journalctl -u guidenco -n 50"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
info "Done. Connect a VNC client to:  ${IP:-<pi-address>}:5900"
info "Set a password in $CONFIG_FILE before exposing this beyond your LAN."
