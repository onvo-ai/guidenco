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
# Bluetooth setup needs BlueZ over D-Bus. These are the only dependencies the
# project has beyond the standard library, and both come from apt, not pip.
apt-get install -y -q --no-install-recommends \
  bluez python3-dbus python3-gi network-manager || \
  warn "Bluetooth setup packages unavailable; BLE configuration will be disabled"

# The USB gadget needs dwc2 and libcomposite. A module counts as available if
# it is loadable OR compiled into the kernel — on Raspberry Pi OS dwc2 is
# built in, and modinfo reports built-in modules as "not found", so checking
# modinfo alone would send us chasing a package we do not need.
have_module() {
  modinfo "$1" >/dev/null 2>&1 && return 0
  grep -q "/$1\.ko" "/lib/modules/$(uname -r)/modules.builtin" 2>/dev/null
}
if ! have_module libcomposite || ! have_module dwc2; then
  # Ubuntu's Pi server images split these into a separate package.
  if apt-cache show "linux-modules-extra-$(uname -r)" >/dev/null 2>&1; then
    info "Installing USB gadget kernel modules..."
    apt-get install -y -q "linux-modules-extra-$(uname -r)" || \
      warn "could not install linux-modules-extra-$(uname -r); USB HID may not work"
  else
    warn "libcomposite/dwc2 unavailable and no linux-modules-extra package matches"
  fi
fi

# ── 2. Hardware detection ─────────────────────────────────────────────────────
pi_model() { tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo "unknown"; }

# The per-node capability block. A Pi exposes a dozen /dev/video* nodes and most
# of them are its own codec and ISP hardware, so "is this a capture device" has
# to be asked precisely. Device Caps describes THIS node; Capabilities describes
# the whole driver and is useless for telling sibling nodes apart.
device_caps() {
  v4l2-ctl -d "$1" --info 2>/dev/null | awk '/Device Caps/{f=1;next} f&&/^\t\t/{print} f&&!/^\t\t/{exit}'
}

# True for a node that can actually hand us frames from an input. Memory-to-
# memory nodes are the Pi's encoders, decoders and ISP: they advertise "Video
# Capture" and enumerate pixel formats, but they capture from another buffer,
# not from a cable, and selecting one yields a service that never sees a frame.
# The SoC's own image-processing blocks. Several of them present capture nodes
# that satisfy every generic test — right capabilities, real pixel formats — but
# they process buffers handed to them, they are not an input. Only unicam (the
# CSI receiver) and uvcvideo (USB cards) see a cable.
_INTERNAL_DRIVERS='bcm2835-codec|bcm2835-isp|rpi-hevc|rpi-.*-dec'

is_real_capture() {
  local driver
  driver="$(v4l2-ctl -d "$1" --info 2>/dev/null | awk -F: '/Driver name/{print $2; exit}' | xargs)"
  [[ -z "$driver" ]] && return 1
  grep -qE "^($_INTERNAL_DRIVERS)$" <<<"$driver" && return 1

  local caps; caps="$(device_caps "$1")"
  grep -q "Video Capture" <<<"$caps" || return 1
  grep -qi "Memory-to-Memory" <<<"$caps" && return 1
  # A capture node with no pixel formats is a metadata node, which uvcvideo
  # exposes next to the real one and sometimes at the lower number.
  v4l2-ctl -d "$1" --list-formats 2>/dev/null | grep -qE "\[[0-9]+\]: '[A-Za-z0-9 ]{4}'"
}

detect_capture_type() {
  # Ask the device how it is attached rather than matching vendor IDs, which
  # will always be an incomplete list.
  for dev in /dev/video*; do
    [[ -e "$dev" ]] || continue
    is_real_capture "$dev" || continue
    local probe=""
    probe="$(v4l2-ctl -d "$dev" --info 2>/dev/null || true)"
    if grep -qi "Bus info.*usb" <<<"$probe"; then echo usb; return; fi
    if grep -qi "tc358743\|unicam\|platform" <<<"$probe"; then echo csi; return; fi
  done

  # No usable node yet. A CSI adapter has none until its overlay is enabled and
  # the Pi has rebooted, which is the normal state on a first install, so fall
  # back to the USB bus: a known capture chipset means a card, otherwise CSI.
  if lsusb 2>/dev/null | grep -qiE '534d:|1b71:|eb1a:|345f:|1e4e:|05e1:'; then
    echo usb
  else
    echo csi
  fi
}

detect_video_dev() {
  for dev in /dev/video*; do
    [[ -e "$dev" ]] || continue
    if is_real_capture "$dev"; then echo "$dev"; return; fi
  done
  echo /dev/video0
}

MODEL="$(pi_model)"
CAPTURE_TYPE="$(detect_capture_type)"
VIDEO_DEV="$(detect_video_dev)"
info "Board:   $MODEL"
info "Capture: $CAPTURE_TYPE ($VIDEO_DEV)"

# ── 2b. cloudflared (optional) ────────────────────────────────────────────────
install_cloudflared() {
  command -v cloudflared >/dev/null 2>&1 && { info "cloudflared already present"; return 0; }
  # cloudflared publishes a .deb per Debian architecture name, so the name maps
  # straight across. It also publishes a separate "arm" build declaring
  # Architecture: arm, which dpkg refuses on an armhf system — mapping armhf to
  # that one is the obvious-looking mistake.
  local arch
  case "$(dpkg --print-architecture)" in
    arm64|armhf|amd64) arch="$(dpkg --print-architecture)" ;;
    armel) arch=arm ;;
    *) warn "no cloudflared build for $(dpkg --print-architecture)"; return 1 ;;
  esac
  info "Installing cloudflared ($arch)..."
  local url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb"
  local tmp; tmp="$(mktemp -d)"
  if ! curl -fsSL --max-time 180 "$url" -o "$tmp/cloudflared.deb"; then
    rm -rf "$tmp"; warn "could not download cloudflared from $url"; return 1
  fi
  # Surface dpkg's reason rather than swallowing it; an architecture mismatch
  # here is silent otherwise and the tunnel just never works.
  local output
  if output="$(dpkg -i "$tmp/cloudflared.deb" 2>&1)"; then
    rm -rf "$tmp"; info "cloudflared installed ($arch)"; return 0
  fi
  warn "could not install cloudflared: $(echo "$output" | tail -2 | tr '\n' ' ')"
  rm -rf "$tmp"
  return 1
}
install_cloudflared || true

# Raspberry Pi OS ships with the Bluetooth radio soft-blocked by rfkill, so
# BlueZ reports the adapter as "off-blocked" and registering an advertisement
# fails with a bare org.bluez.Error.Failed that explains nothing.
if command -v rfkill >/dev/null 2>&1 && rfkill list bluetooth 2>/dev/null | grep -q "Soft blocked: yes"; then
  info "Unblocking the Bluetooth radio (rfkill soft block)..."
  rfkill unblock bluetooth || warn "could not unblock Bluetooth; BLE setup will not start"
fi
systemctl enable --now bluetooth >/dev/null 2>&1 || true

# BlueZ advertises every 1280ms by default, which is fine for a beacon and far
# too slow for a device someone is waiting on in a browser pairing dialog: the
# name lives in the scan response, which needs a second round trip, so at that
# rate the device appears late or under a stale cached name. The LEAdvertisement1
# MinInterval/MaxInterval properties are accepted and then ignored by BlueZ 5.82,
# so set it where it actually takes effect. Units are 0.625ms: 160 = 100ms.
BT_CONF=/etc/bluetooth/main.conf
if [[ -f "$BT_CONF" ]]; then
  if grep -qE '^\s*#?\s*MinAdvertisementInterval=' "$BT_CONF"; then
    sed -i 's/^\s*#\?\s*MinAdvertisementInterval=.*/MinAdvertisementInterval=160/' "$BT_CONF"
    sed -i 's/^\s*#\?\s*MaxAdvertisementInterval=.*/MaxAdvertisementInterval=240/' "$BT_CONF"
  elif grep -q '^\[LE\]' "$BT_CONF"; then
    sed -i '/^\[LE\]/a MinAdvertisementInterval=160\nMaxAdvertisementInterval=240' "$BT_CONF"
  fi
  info "Bluetooth advertising interval set to 100-150ms"
  # The kernel reads these before the adapter is powered, so it must cycle.
  systemctl restart bluetooth >/dev/null 2>&1 || true
  sleep 2
  rfkill unblock bluetooth 2>/dev/null || true
fi

# ── 3. Boot configuration ─────────────────────────────────────────────────────
CONFIG_TXT=/boot/firmware/config.txt
[[ -f "$CONFIG_TXT" ]] || CONFIG_TXT=/boot/config.txt
[[ -f "$CONFIG_TXT" ]] || error "cannot find config.txt — is this a Raspberry Pi?"

REBOOT_NEEDED=0

if [[ "$CAPTURE_TYPE" == "csi" ]]; then
  # Automatic camera detection probes the CSI port for known Pi cameras and
  # claims it. A manually declared overlay has to own the port instead, so the
  # two cannot both be on — with autodetect left enabled the TC358743 may never
  # appear, and nothing says why.
  if grep -qE '^\s*camera_auto_detect=1' "$CONFIG_TXT"; then
    info "Disabling camera_auto_detect (it conflicts with a manual CSI overlay)..."
    sed -i 's/^\s*camera_auto_detect=1/camera_auto_detect=0/' "$CONFIG_TXT"
    REBOOT_NEEDED=1
  fi
  if ! grep -qE '^\s*dtoverlay=tc358743' "$CONFIG_TXT"; then
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
# Section-aware: stock images ship "dtoverlay=dwc2,dr_mode=host" under [cm5]
# and "otg_mode=1" under [cm4]. Neither filter applies to a Model B, so a naive
# grep would either miss them or be fooled by an inert peripheral line sitting
# under a filter that never fires. Only a line in effect for THIS board counts.
dwc2_peripheral_active() {
  awk '
    /^\[/    { section = $0; next }
    /dtoverlay=dwc2/ && /dr_mode=peripheral/ {
      if (section == "" || section == "[all]") { found = 1 }
    }
    END { exit(found ? 0 : 1) }
  ' "$CONFIG_TXT"
}
if ! dwc2_peripheral_active; then
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
# Clear out every component directory, including ones from older versions
# (rfb/ was the VNC server), so a stale module never shadows a current one.
rm -rf "$INSTALL_DIR"/{capture,api,hid,ble,rfb}
for item in main.py config.py capture api hid ble; do
  cp -r "$SOURCE_DIR/$item" "$INSTALL_DIR/"
done
install -m 755 "$SOURCE_DIR/hid-gadget-setup.sh" /usr/local/bin/guidenco-hid-setup

# ── 5. Configuration ──────────────────────────────────────────────────────────
# Written once and never overwritten, so re-running the installer does not throw
# away a password or a tuned resolution.
if [[ ! -f "$CONFIG_FILE" ]]; then
  # A token is generated rather than left blank, because an unconfigured bridge
  # on an open port hands full keyboard and mouse control of the target machine
  # to anyone who can reach it.
  TOKEN="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  info "Writing $CONFIG_FILE"
  cat > "$CONFIG_FILE" <<EOF
# guidenco configuration. Restart after editing:
#   sudo systemctl restart guidenco

# Capture hardware — "usb", "csi", or "test" for a synthetic pattern.
CAPTURE_TYPE=$CAPTURE_TYPE
VIDEO_DEV=$VIDEO_DEV

# Served screen size. 0 means the capture device's own resolution, which is
# also the only setting that allows JPEG passthrough with no re-encoding.
STREAM_W=0
STREAM_H=0
STREAM_FPS=10

# Ceiling on the capture mode chosen by probing. Cards advertise what their
# chip can do, not what is plugged in; raise this only if the source is
# genuinely above 1080p.
CAPTURE_MAX_W=1920
CAPTURE_MAX_H=1080

# HTTP API. Clear API_TOKEN to run without authentication — only sensible on a
# network you fully trust.
API_PORT=8080
API_TOKEN=$TOKEN

# Input replay: "auto" uses the USB HID gadget when present, "off" serves the
# screen read-only, "on" makes a missing gadget a loud error.
HID_ENABLED=auto

# Pointer moves are interpolated with easing. Set to "off" for instant jumps —
# faster for bulk automation, but hover states and drags often stop working.
MOUSE_SMOOTH=on

# Cloudflare quick tunnel. Set to "on" to publish this bridge to the internet on
# a random trycloudflare.com hostname that changes on every restart. The service
# refuses to open a tunnel while API_TOKEN is empty, because that would hand
# keyboard and mouse control of the target to anyone who finds the URL.
TUNNEL_ENABLED=off

# Bluetooth setup service: lets a browser set Wi-Fi and read the tunnel URL
# without the Pi being reachable on any network.
BLE_ENABLED=on
BLE_NAME=guidenco
EOF
  chmod 600 "$CONFIG_FILE"
else
  info "Keeping existing $CONFIG_FILE"
  # Settings change between versions. Rather than leave a config that silently
  # lacks new keys — and so runs on defaults the operator never chose — add
  # what is missing and retire what no longer means anything.
  ensure_key() {
    grep -qE "^${1}=" "$CONFIG_FILE" || {
      info "  adding $1"
      printf '%s=%s\n' "$1" "$2" >> "$CONFIG_FILE"
    }
  }
  ensure_key API_PORT 8080
  ensure_key API_TOKEN "$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  ensure_key CAPTURE_MAX_W 1920
  ensure_key CAPTURE_MAX_H 1080
  ensure_key MOUSE_SMOOTH on
  ensure_key HID_ENABLED auto
  ensure_key TUNNEL_ENABLED off
  ensure_key BLE_ENABLED on
  ensure_key BLE_NAME guidenco
  for dead in VNC_PORT VNC_PASSWORD VNC_MAX_CLIENTS VNC_HOST VNC_NAME; do
    if grep -qE "^${dead}=" "$CONFIG_FILE"; then
      info "  removing $dead (no longer used)"
      sed -i "/^${dead}=/d" "$CONFIG_FILE"
    fi
  done
  TOKEN="$(grep -E '^API_TOKEN=' "$CONFIG_FILE" | cut -d= -f2-)"
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
PORT="$(grep -E '^API_PORT=' "$CONFIG_FILE" | cut -d= -f2- || echo 8080)"
BASE="http://${IP:-<pi-address>}:${PORT:-8080}"
echo
info "Done."
cat <<EOF

  MCP      $BASE/mcp
  Screen   $BASE/screenshot
  Watch    $BASE/stream        (open this in a browser)
  Health   $BASE/health

  Token    ${TOKEN:-(none - the service is open)}

  Connect Claude to it:
    claude mcp add --transport http guidenco $BASE/mcp \\
      --header "Authorization: Bearer $TOKEN"

EOF
info "Bluetooth setup advertises as \"$(grep -E '^BLE_NAME=' "$CONFIG_FILE" | cut -d= -f2- || echo guidenco)\" for Wi-Fi and tunnel URL."
if command -v cloudflared >/dev/null 2>&1; then
  info "For a public URL, set TUNNEL_ENABLED=on in $CONFIG_FILE and restart."
fi
