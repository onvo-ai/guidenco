#!/bin/bash
# cloudflared-setup.sh — Install and configure Cloudflare Tunnel on the Pi
# Expects CLOUDFLARE_TUNNEL_TOKEN to be set in the environment.

set -euo pipefail

if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is not set."
  echo "Add it to .env.deploy: CLOUDFLARE_TUNNEL_TOKEN=<your token>"
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  echo "Installing cloudflared..."
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    | sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt-get update -qq
  sudo apt-get install -y cloudflared
else
  echo "cloudflared already installed: $(cloudflared --version)"
fi

echo "Installing Cloudflare Tunnel service..."
sudo cloudflared service install "$CLOUDFLARE_TUNNEL_TOKEN"

sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sleep 2
sudo systemctl status cloudflared --no-pager -l | head -15

echo ""
echo "Cloudflare Tunnel setup complete — bot.ronnel.cloud is live."
