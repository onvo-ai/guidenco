#!/bin/bash
# deploy.sh — Copy latest guidenco code to the Raspberry Pi and restart
# Usage: PI_HOST=192.168.0.42 ./deploy.sh
#
# Auth: uses SSH keys by default. For password auth, export PI_PASS.
# First-time setup: cd ansible && ansible-playbook provision.yml

set -euo pipefail

PI_USER="${PI_USER:-ronnel}"
PI_HOST="${PI_HOST:-pi.local}"
PI_PATH="${PI_PATH:-/home/ronnel/Desktop/guidenco}"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${PI_PASS:-}" ] && [ -f "$LOCAL_PATH/.env.deploy" ]; then
  . "$LOCAL_PATH/.env.deploy"
fi

SSH_CMD="ssh -o StrictHostKeyChecking=no"
if [ -n "${PI_PASS:-}" ]; then
  if ! command -v sshpass &>/dev/null; then
    echo "PI_PASS set but sshpass not installed. Install with: brew install hudochenkov/sshpass/sshpass"
    exit 1
  fi
  SSH_CMD="sshpass -p \"$PI_PASS\" ssh -o StrictHostKeyChecking=no"
fi

echo "Building frontend..."
(cd "$LOCAL_PATH/frontend" && npm run build) || { echo "Frontend build failed."; exit 1; }
echo ""

echo "Deploying guidenco to $PI_USER@$PI_HOST..."
echo "   Source: $LOCAL_PATH"
echo "   Target: $PI_PATH"
echo ""

rsync -avz \
  --exclude='__pycache__' --exclude='*.pyc' --exclude='temp/' \
  --exclude='*.bak' --exclude='.DS_Store' --exclude='deploy.sh' \
  --exclude='.env' --exclude='.env.deploy' --exclude='settings.json' \
  --exclude='node_modules/' --exclude='.git/' \
  --exclude='package-lock.json' --exclude='frontend/src/' \
  --exclude='frontend/node_modules/' --exclude='frontend/.vite/' \
  --exclude='venv/' --exclude='ansible/' \
  -e "$SSH_CMD" \
  "$LOCAL_PATH/" \
  "$PI_USER@$PI_HOST:$PI_PATH/"

# Merge settings.json — add any new keys from local without overwriting Pi's existing values
echo "Merging settings.json (preserving Pi's runtime config)..."
if [ -n "${PI_PASS:-}" ]; then
  sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no \
    "$LOCAL_PATH/settings.json" "$PI_USER@$PI_HOST:/tmp/settings_local.json"
  sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no \
    "$LOCAL_PATH/merge_settings.py" "$PI_USER@$PI_HOST:/tmp/merge_settings.py"
  sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
    "python3 /tmp/merge_settings.py /tmp/settings_local.json $PI_PATH/settings.json"
else
  scp -o StrictHostKeyChecking=no \
    "$LOCAL_PATH/settings.json" "$PI_USER@$PI_HOST:/tmp/settings_local.json"
  scp -o StrictHostKeyChecking=no \
    "$LOCAL_PATH/merge_settings.py" "$PI_USER@$PI_HOST:/tmp/merge_settings.py"
  ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
    "python3 /tmp/merge_settings.py /tmp/settings_local.json $PI_PATH/settings.json"
fi

echo ""
echo "Files synced. Fixing permissions and restarting guidenco service..."

if [ -n "${PI_PASS:-}" ]; then
  sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
    "chmod +x $PI_PATH/setup_hid_gadget.sh $PI_PATH/cloudflared-setup.sh && echo '$PI_PASS' | sudo -S systemctl restart guidenco.service && sleep 2 && echo '$PI_PASS' | sudo -S systemctl status guidenco.service --no-pager -l | head -20"
else
  ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
    "chmod +x $PI_PATH/setup_hid_gadget.sh $PI_PATH/cloudflared-setup.sh && sudo systemctl restart guidenco.service && sleep 2 && sudo systemctl status guidenco.service --no-pager -l | head -20"
fi

if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo ""
  echo "Setting up Cloudflare Tunnel..."
  if [ -n "${PI_PASS:-}" ]; then
    sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
      "CLOUDFLARE_TUNNEL_TOKEN='$CLOUDFLARE_TUNNEL_TOKEN' bash $PI_PATH/cloudflared-setup.sh"
  else
    ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
      "CLOUDFLARE_TUNNEL_TOKEN='$CLOUDFLARE_TUNNEL_TOKEN' bash $PI_PATH/cloudflared-setup.sh"
  fi
else
  echo ""
  echo "Skipping Cloudflare Tunnel setup (CLOUDFLARE_TUNNEL_TOKEN not set in .env.deploy)."
fi

echo ""
echo "Deploy complete. Open: http://$PI_HOST:5000/"