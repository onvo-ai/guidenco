#!/usr/bin/env bash
# Guidenco Pi installer — Ubuntu Server / Raspberry Pi OS, all Pi models.
# Supports USB HDMI capture cards AND HDMI-to-CSI adapters (TC358743).
#
#   curl -fsSL https://guidenco.app/install.sh | sudo bash
#
set -euo pipefail

CLOUD_URL="${GUIDENCO_CLOUD_URL:-https://guidenco.app}"
# The web app serves the agent source as a tarball (single source of truth).
TARBALL_URL="${GUIDENCO_TARBALL:-$CLOUD_URL/api/install/bridged/tarball}"
INSTALL_DIR="/opt/guidenco"
ENV_FILE="/etc/guidenco/device.env"
SERVICE_FILE="/etc/systemd/system/guidenco.service"
HID_SCRIPT="/usr/local/bin/guidenco-hid-setup"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[guidenco]${NC} $*"; }
warn()  { echo -e "${YELLOW}[guidenco] WARN:${NC} $*"; }
error() { echo -e "${RED}[guidenco] ERROR:${NC} $*" >&2; exit 1; }
box()   {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  while IFS= read -r line; do echo -e "  $line"; done <<< "$1"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ── 1. Preflight ──────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || error "This installer requires Linux (Raspberry Pi)"
command -v sudo >/dev/null 2>&1 || error "sudo is required"
info "Checking connectivity to $CLOUD_URL..."
curl -fsSL --max-time 10 "$CLOUD_URL/api/health" >/dev/null 2>&1 \
  || error "Cannot reach $CLOUD_URL — check your internet connection"

if [[ -f "$ENV_FILE" && -d "$INSTALL_DIR" ]]; then
  info "Existing install detected — updating in place..."
  UPDATE_MODE=1
else
  UPDATE_MODE=0
fi

# ── 2. System packages ────────────────────────────────────────────────────────
# Capture uses ffmpeg + v4l-utils; the agent needs only python3 + venv. No
# compiled Python deps, so no toolchain or -dev headers required.
info "Installing system packages..."
sudo apt-get update -q -y
# --no-install-recommends keeps ffmpeg from dragging in its GUI/TTS recommends
# tree (gtk, rsvg, flite, …) — none of which the headless capture path needs.
sudo apt-get install -y -q --no-install-recommends python3 python3-venv ffmpeg v4l-utils curl

# ── 3. Hardware detection ─────────────────────────────────────────────────────
pi_model() {
  grep -oP "(?<=Model\s:\s).*" /proc/cpuinfo 2>/dev/null \
    || cat /proc/device-tree/model 2>/dev/null \
    || echo "unknown"
}

# Returns: usb | csi
detect_capture_type() {
  # Known USB HDMI capture card vendor IDs:
  #   534d / 345f Macrosilicon (MS2109/MS2130)   1de1 Actions   0bda Realtek
  #   eb1a eMPIA (em28xx)                         2040 Hauppauge
  if lsusb 2>/dev/null | grep -qiE "534d:|345f:|1de1:|0bda:5846|eb1a:|2040:"; then
    echo "usb"; return
  fi
  if v4l2-ctl --list-devices 2>/dev/null | grep -qi "usb"; then
    echo "usb"; return
  fi
  if lsusb 2>/dev/null | grep -qi "video"; then
    echo "usb"; return
  fi
  # No USB capture device — assume an HDMI-to-CSI adapter (TC358743).
  echo "csi"
}

detect_video_dev() {
  for dev in /dev/video0 /dev/video1 /dev/video2 /dev/video3; do
    [[ -e "$dev" ]] && { echo "$dev"; return; }
  done
  echo "/dev/video0"   # appears after the tc358743 module loads / reboot
}

MODEL=$(pi_model)
CAPTURE_TYPE=$(detect_capture_type)
info "Pi model: $MODEL"
info "Capture hardware: $CAPTURE_TYPE"

# ── 4. Boot configuration (capture + USB gadget) ─────────────────────────────
NEEDS_REBOOT=0

# Locate the Pi boot config (shared by the CSI and HID-gadget setup below).
CONFIG_TXT=""
for candidate in /boot/firmware/config.txt /boot/config.txt; do
  [[ -f "$candidate" ]] && { CONFIG_TXT="$candidate"; break; }
done

# CSI capture needs the TC358743 overlay + kernel module.
if [[ "$CAPTURE_TYPE" == "csi" ]]; then
  [[ -n "$CONFIG_TXT" ]] || error "Cannot find Pi config.txt"
  info "Configuring HDMI-to-CSI adapter (TC358743)..."
  if ! grep -q "dtoverlay=tc358743" "$CONFIG_TXT"; then
    info "Adding tc358743 overlay to $CONFIG_TXT..."
    {
      echo ""
      echo "# Guidenco: HDMI-to-CSI adapter"
      echo "dtoverlay=tc358743"
    } | sudo tee -a "$CONFIG_TXT" > /dev/null
    NEEDS_REBOOT=1
  else
    info "tc358743 overlay already present."
  fi
  grep -q "tc358743" /etc/modules 2>/dev/null || echo "tc358743" | sudo tee -a /etc/modules > /dev/null
  sudo modprobe tc358743 2>/dev/null || true
fi

# USB HID gadget: the Pi must present as a USB keyboard/mouse to the target
# machine, which requires the dwc2 controller in peripheral mode. If no USB
# device controller exists yet, add the overlay under an [all] section — Pi 4/5
# stock configs often place it under a CM-only filter ([cm4]/[cm5]) that never
# applies to a Model B, leaving the gadget controller disabled.
if [[ -z "$(ls /sys/class/udc/ 2>/dev/null)" ]]; then
  if [[ -n "$CONFIG_TXT" ]] && ! grep -q "Guidenco: USB gadget" "$CONFIG_TXT"; then
    info "Enabling USB gadget mode for HID (dwc2 peripheral)..."
    {
      echo ""
      echo "[all]"
      echo "# Guidenco: USB gadget (HID keyboard/mouse) — USB-C in peripheral mode"
      echo "dtoverlay=dwc2,dr_mode=peripheral"
    } | sudo tee -a "$CONFIG_TXT" > /dev/null
    NEEDS_REBOOT=1
  fi
fi

VIDEO_DEV=$(detect_video_dev)
info "Video device: $VIDEO_DEV"

# ── 5. Download agent source ──────────────────────────────────────────────────
info "Downloading Guidenco agent..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$TARBALL_URL" -o "$TMP/agent.tar.gz" || error "Failed to download agent from $TARBALL_URL"
tar -xzf "$TMP/agent.tar.gz" -C "$TMP"
SRC="$TMP/pi-agent"
[[ -d "$SRC" ]] || error "Downloaded tarball has unexpected structure (no pi-agent/ dir)"
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete --exclude '__pycache__' "$SRC/" "$INSTALL_DIR/"

# ── 6. Python virtualenv ──────────────────────────────────────────────────────
info "Setting up Python environment..."
sudo python3 -m venv "$INSTALL_DIR/venv"
sudo "$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
sudo "$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"

# ── 7. USB HID gadget setup script ────────────────────────────────────────────
info "Installing USB HID gadget setup..."
sudo cp "$INSTALL_DIR/hid-gadget-setup.sh" "$HID_SCRIPT"
sudo chmod +x "$HID_SCRIPT"

# ── 8. Environment file ───────────────────────────────────────────────────────
if [[ $UPDATE_MODE -eq 1 ]]; then
  # Preserve credentials; refresh hardware-derived values (may change on swap).
  DEVICE_ID=$(grep "^DEVICE_ID=" "$ENV_FILE" | cut -d= -f2)
  DEVICE_TOKEN=$(grep "^DEVICE_TOKEN=" "$ENV_FILE" | cut -d= -f2 || true)
else
  DEVICE_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
  DEVICE_TOKEN=""
fi

sudo mkdir -p /etc/guidenco
{
  echo "DEVICE_ID=$DEVICE_ID"
  echo "CLOUD_URL=$CLOUD_URL"
  echo "CAPTURE_TYPE=$CAPTURE_TYPE"
  echo "VIDEO_DEV=$VIDEO_DEV"
  if [[ -n "$DEVICE_TOKEN" ]]; then echo "DEVICE_TOKEN=$DEVICE_TOKEN"; fi
} | sudo tee "$ENV_FILE" > /dev/null

# ── 9. systemd service ────────────────────────────────────────────────────────
info "Installing systemd service..."
sudo cp "$INSTALL_DIR/guidenco.service" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable guidenco.service

# ── Update mode: restart and exit ─────────────────────────────────────────────
if [[ $UPDATE_MODE -eq 1 ]]; then
  sudo systemctl restart guidenco.service
  info "Update complete."
  [[ $NEEDS_REBOOT -eq 1 ]] && warn "Reboot required to finish hardware setup: sudo reboot"
  exit 0
fi

# ── 10. Register with the cloud ───────────────────────────────────────────────
info "Registering device..."
RESPONSE=$(curl -fsSL -X POST "$CLOUD_URL/api/devices/claim-init" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\"}" 2>/dev/null) \
  || error "Failed to contact Guidenco cloud."
CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])" 2>/dev/null) \
  || error "Unexpected response: $RESPONSE"

box "Guidenco installed!\n\n  To link this device:\n\n    1. Open: ${BOLD}$CLOUD_URL${NC}\n    2. Sign in and click ${BOLD}Add Device${NC}\n    3. Enter code: ${BOLD}${GREEN}$CODE${NC}\n\n  Code expires in 15 minutes."

# ── 11. Poll for the dashboard claim ──────────────────────────────────────────
info "Waiting for device to be linked..."
ELAPSED=0
while [[ $ELAPSED -lt 900 ]]; do
  sleep 5; ELAPSED=$((ELAPSED + 5))
  STATUS=$(curl -fsSL "$CLOUD_URL/api/devices/claim-status?device_id=$DEVICE_ID" 2>/dev/null || echo '{}')
  CLAIM=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  if [[ "$CLAIM" == "claimed" ]]; then
    DEVICE_TOKEN=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['device_token'])" 2>/dev/null) \
      || error "Could not parse device_token"
    break
  elif [[ "$CLAIM" == "expired" ]]; then
    error "Pairing code expired. Re-run this script."
  fi
done
[[ -n "$DEVICE_TOKEN" ]] || error "Timed out waiting for link (15 min). Re-run this script."

# ── 12. Save token and start ──────────────────────────────────────────────────
echo "DEVICE_TOKEN=$DEVICE_TOKEN" | sudo tee -a "$ENV_FILE" > /dev/null

if [[ $NEEDS_REBOOT -eq 1 ]]; then
  box "${GREEN}Device linked!${NC}\n\n  ${YELLOW}A reboot is required to finish hardware setup${NC}\n  ${YELLOW}(USB gadget / capture overlay).${NC}\n\n  Run:  sudo reboot\n\n  Guidenco starts automatically after reboot.\n  Open $CLOUD_URL to control it."
else
  sudo systemctl start guidenco.service
  box "${GREEN}Device linked!${NC}\n\n  Your Raspberry Pi is now connected.\n  Open $CLOUD_URL to control it."
fi
