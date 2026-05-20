#!/usr/bin/env bash
# Guidenco Pi installer — curl -fsSL https://openclaw.ai/install.sh | bash
set -euo pipefail

CLOUD_URL="${GUIDENCO_CLOUD_URL:-https://openclaw.ai}"
REPO_TARBALL="${GUIDENCO_TARBALL:-https://github.com/YOUR_ORG/guidenco/archive/refs/heads/main.tar.gz}"
INSTALL_DIR="/opt/guidenco"
ENV_FILE="/etc/guidenco/device.env"
SERVICE_FILE="/etc/systemd/system/guidenco.service"
HID_SCRIPT="/usr/local/bin/guidenco-hid-setup"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[guidenco]${NC} $*"; }
warn()  { echo -e "${YELLOW}[guidenco]${NC} $*"; }
error() { echo -e "${RED}[guidenco] ERROR:${NC} $*" >&2; exit 1; }
box()   {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  while IFS= read -r line; do echo -e "  $line"; done <<< "$1"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ── 1. Preflight ──────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || error "This script requires Linux (Raspberry Pi OS / Ubuntu)"
command -v sudo >/dev/null 2>&1 || error "sudo is required"
info "Checking connectivity to $CLOUD_URL..."
curl -fsSL --max-time 10 "$CLOUD_URL/api/health" >/dev/null 2>&1 \
  || error "Cannot reach $CLOUD_URL — check your internet connection"

# ── Update mode detection ─────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" && -d "$INSTALL_DIR" ]]; then
  info "Existing Guidenco install detected — updating service files..."
  UPDATE_MODE=1
else
  UPDATE_MODE=0
fi

# ── 2. System packages ────────────────────────────────────────────────────────
info "Installing system packages..."
sudo apt-get update -q -y
sudo apt-get install -y -q python3 python3-venv ffmpeg v4l-utils curl git

# ── 3. Download service ───────────────────────────────────────────────────────
info "Downloading Guidenco service..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$REPO_TARBALL" -o "$TMP/guidenco.tar.gz"
tar -xzf "$TMP/guidenco.tar.gz" -C "$TMP"
EXTRACTED=$(find "$TMP" -maxdepth 1 -type d -name "guidenco-*" | head -1)
[[ -d "$EXTRACTED/service" ]] || error "Downloaded tarball has unexpected structure"
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete "$EXTRACTED/service/" "$INSTALL_DIR/"

# ── 4. Python venv ────────────────────────────────────────────────────────────
info "Setting up Python environment..."
sudo python3 -m venv "$INSTALL_DIR/venv"
sudo "$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
sudo "$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"

# ── 5. HID gadget ─────────────────────────────────────────────────────────────
info "Configuring USB HID gadget..."
sudo cp "$INSTALL_DIR/setup_hid_gadget.sh" "$HID_SCRIPT"
sudo chmod +x "$HID_SCRIPT"

# ── Update mode: just restart and exit ────────────────────────────────────────
if [[ $UPDATE_MODE -eq 1 ]]; then
  sudo systemctl restart guidenco.service
  info "Update complete."
  exit 0
fi

# ── 6. Environment file (fresh install only) ──────────────────────────────────
DEVICE_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
sudo mkdir -p /etc/guidenco
{
  echo "DEVICE_ID=$DEVICE_ID"
  echo "CLOUD_URL=$CLOUD_URL"
} | sudo tee "$ENV_FILE" > /dev/null

# ── 7. Systemd service ────────────────────────────────────────────────────────
info "Installing systemd service..."
sudo cp "$INSTALL_DIR/guidenco.service" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable guidenco.service

# ── 8. Register with cloud ────────────────────────────────────────────────────
info "Registering device..."
RESPONSE=$(curl -fsSL -X POST "$CLOUD_URL/api/devices/claim-init" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\"}" 2>/dev/null) \
  || error "Failed to contact Guidenco cloud. Check your internet connection."
CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])" 2>/dev/null) \
  || error "Unexpected response from cloud: $RESPONSE"

# ── 9. Print code ─────────────────────────────────────────────────────────────
box "Guidenco installed!\n\n  To link this device:\n\n    1. Go to: ${BOLD}$CLOUD_URL${NC}\n    2. Sign in and click ${BOLD}Add Device${NC}\n    3. Enter code: ${BOLD}${GREEN}$CODE${NC}\n\n  Code expires in 15 minutes."

# ── 10. Poll for claim ────────────────────────────────────────────────────────
info "Waiting for device to be linked in the web app..."
TIMEOUT=900
ELAPSED=0
DEVICE_TOKEN=""

while [[ $ELAPSED -lt $TIMEOUT ]]; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  STATUS=$(curl -fsSL "$CLOUD_URL/api/devices/claim-status?device_id=$DEVICE_ID" 2>/dev/null \
    || echo '{"status":"error"}')
  CLAIM_STATUS=$(echo "$STATUS" | python3 -c \
    "import sys,json; print(json.load(sys.stdin).get('status','error'))" 2>/dev/null \
    || echo "error")

  if [[ "$CLAIM_STATUS" == "claimed" ]]; then
    DEVICE_TOKEN=$(echo "$STATUS" | python3 -c \
      "import sys,json; print(json.load(sys.stdin)['device_token'])" 2>/dev/null) \
      || error "Could not parse device_token from response"
    break
  elif [[ "$CLAIM_STATUS" == "expired" ]]; then
    error "The pairing code expired. Re-run this script to generate a new one."
  fi
done

[[ -n "$DEVICE_TOKEN" ]] || error "Timed out waiting for device to be linked (15 min). Re-run this script."

# ── Save token and start service ──────────────────────────────────────────────
echo "DEVICE_TOKEN=$DEVICE_TOKEN" | sudo tee -a "$ENV_FILE" > /dev/null
sudo systemctl start guidenco.service

box "${GREEN}Device linked successfully!${NC}\n\n  Your Raspberry Pi is now connected to Guidenco.\n  Open $CLOUD_URL to control it."
