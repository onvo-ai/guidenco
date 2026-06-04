# Captive Portal WiFi Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Guidenco Pi boots with no internet, it creates a `Guidenco-Setup` WiFi hotspot and serves a captive-portal page where the user picks their WiFi network, enters their password, and receives a pairing code — all from a phone, no SD card required.

**Architecture:** A new one-shot systemd service (`guidenco-portal.service`) runs before `guidenco.service` on every boot. It pings `1.1.1.1` for up to 30 s; if internet is available it exits immediately. If not, it creates a virtual `uap0` AP interface, starts `hostapd`+`dnsmasq`, and serves a captive-portal web app on port 80. After the user connects their phone and completes setup, the Pi connects to their WiFi, registers with the cloud, shows the pairing code, tears down the hotspot, and `guidenco.service` starts normally.

**Tech Stack:** Python 3 stdlib (`http.server`, `urllib`, `subprocess`), `hostapd`, `dnsmasq`, `wpa_supplicant`, `iwlist`, inline HTML/CSS/JS (no build step), systemd.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `pi-agent/captive.py` | Boot orchestrator: internet check → hotspot start → portal start |
| Create | `pi-agent/portal/` | Python package |
| Create | `pi-agent/portal/__init__.py` | Empty |
| Create | `pi-agent/portal/handler.py` | HTTP request handler: serves UI, `/scan`, `/connect`, captive redirects |
| Create | `pi-agent/portal/wifi.py` | WiFi scan + connect logic (`iwlist`, `wpa_supplicant`) |
| Create | `pi-agent/portal/cloud.py` | Device registration + claim polling |
| Create | `pi-agent/portal/hotspot.sh` | Shell: create `uap0`, start/stop `hostapd`+`dnsmasq` |
| Create | `pi-agent/portal/index.html` | Self-contained setup UI (three states) |
| Create | `pi-agent/guidenco-portal.service` | systemd one-shot unit, `Before=guidenco.service` |
| Modify | `pi-agent/guidenco.service` | Add `After=guidenco-portal.service` |
| Modify | `pi-agent/install.sh` | Install `hostapd dnsmasq`, mask auto-start, copy + enable portal service |

---

## Task 1: Hotspot shell script

**Files:**
- Create: `pi-agent/portal/hotspot.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# hotspot.sh start|stop — manages the Guidenco-Setup access point.
# Uses a virtual uap0 interface so wlan0 remains a WPA client (concurrent AP+station).
set -euo pipefail

IFACE_AP="uap0"
IFACE_CLIENT="wlan0"
AP_IP="192.168.4.1"
SSID="Guidenco-Setup"
HOSTAPD_CONF="/tmp/guidenco-hostapd.conf"
DNSMASQ_CONF="/tmp/guidenco-dnsmasq.conf"
DNSMASQ_PID="/tmp/guidenco-dnsmasq.pid"

start() {
  # Virtual AP interface (Broadcom on Pi 4 supports concurrent AP+station)
  iw dev "$IFACE_CLIENT" interface add "$IFACE_AP" type __ap
  ip link set dev "$IFACE_AP" up
  ip addr add "${AP_IP}/24" dev "$IFACE_AP"

  cat > "$HOSTAPD_CONF" <<EOF
interface=$IFACE_AP
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=0
auth_algs=1
ignore_broadcast_ssid=0
EOF

  cat > "$DNSMASQ_CONF" <<EOF
interface=$IFACE_AP
bind-interfaces
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,1h
# Redirect ALL DNS queries to the portal — triggers captive portal detection
address=/#/$AP_IP
EOF

  hostapd -B "$HOSTAPD_CONF"
  dnsmasq --conf-file="$DNSMASQ_CONF" --pid-file="$DNSMASQ_PID"
}

stop() {
  pkill -f "hostapd.*guidenco-hostapd" 2>/dev/null || true
  if [[ -f "$DNSMASQ_PID" ]]; then
    kill "$(cat "$DNSMASQ_PID")" 2>/dev/null || true
    rm -f "$DNSMASQ_PID"
  fi
  # Remove virtual AP interface
  ip link set dev "$IFACE_AP" down 2>/dev/null || true
  iw dev "$IFACE_AP" del 2>/dev/null || true
}

case "${1:-}" in
  start) start ;;
  stop)  stop  ;;
  *) echo "Usage: $0 {start|stop}" >&2; exit 1 ;;
esac
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x pi-agent/portal/hotspot.sh
git add pi-agent/portal/hotspot.sh
git commit -m "feat(portal): hotspot start/stop script (uap0 virtual AP)"
```

---

## Task 2: WiFi scan + connect logic

**Files:**
- Create: `pi-agent/portal/__init__.py`
- Create: `pi-agent/portal/wifi.py`

- [ ] **Step 1: Create empty `__init__.py`**

```python
# pi-agent/portal/__init__.py
```

- [ ] **Step 2: Create `wifi.py`**

```python
# pi-agent/portal/wifi.py
"""WiFi scanning and connection helpers (wpa_supplicant / iwlist)."""
import logging
import re
import subprocess
import time

logger = logging.getLogger("guidenco.portal.wifi")

WPA_CONF = "/etc/wpa_supplicant/wpa_supplicant.conf"


def scan() -> list[dict]:
    """Return list of {ssid, signal} dicts sorted strongest-first."""
    try:
        result = subprocess.run(
            ["iwlist", "wlan0", "scan"],
            capture_output=True, text=True, timeout=15,
        )
    except Exception:
        logger.exception("iwlist scan failed")
        return []

    networks: list[dict] = []
    ssid: str | None = None
    signal: int = -100

    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("Cell "):
            if ssid is not None:
                networks.append({"ssid": ssid, "signal": signal})
            ssid = None
            signal = -100
        elif 'ESSID:"' in line:
            m = re.search(r'ESSID:"([^"]*)"', line)
            if m:
                ssid = m.group(1)
        elif "Signal level=" in line:
            m = re.search(r"Signal level=(-?\d+)", line)
            if m:
                signal = int(m.group(1))

    if ssid is not None:
        networks.append({"ssid": ssid, "signal": signal})

    # Deduplicate (keep highest signal), sort strongest-first, drop empty SSIDs
    seen: set[str] = set()
    unique: list[dict] = []
    for n in sorted(networks, key=lambda x: x["signal"], reverse=True):
        if n["ssid"] and n["ssid"] not in seen:
            seen.add(n["ssid"])
            unique.append(n)
    return unique


def connect(ssid: str, password: str) -> bool:
    """
    Write wpa_supplicant.conf, reconfigure the interface, wait for association,
    then confirm internet by pinging 1.1.1.1.
    Returns True if internet is reachable after connection.
    """
    config = (
        "ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\n"
        "update_config=1\n"
        "country=US\n\n"
        "network={\n"
        f'    ssid="{ssid}"\n'
        f'    psk="{password}"\n'
        "    key_mgmt=WPA-PSK\n"
        "}\n"
    )
    try:
        with open(WPA_CONF, "w") as fh:
            fh.write(config)
        subprocess.run(
            ["wpa_cli", "-i", "wlan0", "reconfigure"],
            capture_output=True, timeout=10,
        )
        # Give wpa_supplicant time to associate and DHCP client time to get IP
        time.sleep(20)
        return _ping_ok("1.1.1.1") or _ping_ok("8.8.8.8")
    except Exception:
        logger.exception("WiFi connect failed")
        return False


def _ping_ok(host: str) -> bool:
    r = subprocess.run(
        ["ping", "-c1", "-W3", host],
        capture_output=True, timeout=8,
    )
    return r.returncode == 0
```

- [ ] **Step 3: Commit**

```bash
git add pi-agent/portal/__init__.py pi-agent/portal/wifi.py
git commit -m "feat(portal): WiFi scan + connect helpers"
```

---

## Task 3: Cloud registration + claim polling

**Files:**
- Create: `pi-agent/portal/cloud.py`

- [ ] **Step 1: Create `cloud.py`**

```python
# pi-agent/portal/cloud.py
"""Device registration and claim-status polling."""
import json
import logging
import os
import time
import urllib.request
import uuid

logger = logging.getLogger("guidenco.portal.cloud")

DEVICE_ENV = "/etc/guidenco/device.env"


def _load_env(path: str) -> dict[str, str]:
    env: dict[str, str] = {}
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k] = v
    except FileNotFoundError:
        pass
    return env


def register(cloud_url: str) -> tuple[str, str]:
    """
    POST /api/devices/claim-init.
    Returns (device_id, pairing_code).
    Writes DEVICE_ID + CLOUD_URL to DEVICE_ENV; does NOT write DEVICE_TOKEN yet.
    """
    env = _load_env(DEVICE_ENV)
    device_id = env.get("DEVICE_ID") or str(uuid.uuid4())

    data = json.dumps({"device_id": device_id}).encode()
    req = urllib.request.Request(
        f"{cloud_url}/api/devices/claim-init",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read())

    code: str = body["code"]

    # Persist device_id and cloud URL for guidenco.service
    os.makedirs(os.path.dirname(DEVICE_ENV), exist_ok=True)
    existing = _load_env(DEVICE_ENV)
    existing["DEVICE_ID"] = device_id
    existing["CLOUD_URL"] = cloud_url
    _write_env(DEVICE_ENV, existing)

    logger.info(f"Registered device {device_id}, code={code}")
    return device_id, code


def poll_until_claimed(cloud_url: str, device_id: str, on_claimed: callable) -> None:
    """
    Polls GET /api/devices/claim-status every 5 s in the calling thread.
    Calls on_claimed(token) when status == 'claimed'.
    Stops on 'expired' or after 15 minutes.
    """
    deadline = time.time() + 900  # 15 min
    while time.time() < deadline:
        time.sleep(5)
        try:
            url = f"{cloud_url}/api/devices/claim-status?device_id={device_id}"
            with urllib.request.urlopen(url, timeout=10) as resp:
                body = json.loads(resp.read())
            status = body.get("status", "")
            if status == "claimed":
                token: str = body.get("device_token", "")
                _append_env(DEVICE_ENV, {"DEVICE_TOKEN": token})
                logger.info("Device claimed — token saved")
                on_claimed(token)
                return
            elif status == "expired":
                logger.warning("Pairing code expired")
                return
        except Exception:
            logger.debug("poll_until_claimed: request failed, retrying")


def _write_env(path: str, data: dict[str, str]) -> None:
    with open(path, "w") as fh:
        for k, v in data.items():
            fh.write(f"{k}={v}\n")


def _append_env(path: str, data: dict[str, str]) -> None:
    with open(path, "a") as fh:
        for k, v in data.items():
            fh.write(f"{k}={v}\n")
```

- [ ] **Step 2: Commit**

```bash
git add pi-agent/portal/cloud.py
git commit -m "feat(portal): device registration + claim polling"
```

---

## Task 4: Setup UI (index.html)

**Files:**
- Create: `pi-agent/portal/index.html`

- [ ] **Step 1: Create self-contained HTML**

All three states (pick, connecting, success) are rendered client-side. Design tokens from `DESIGN.md`: canvas `#000000`, surface-card `#0a0a0c`, hairline-strong `rgba(255,255,255,0.14)`, ink `#fcfdff`, body `rgba(252,253,255,0.86)`, accent-green `#11ff99`, accent-red `#ff2047`, link `#3b9eff`, rounded.md `8px`, rounded.lg `12px`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Guidenco Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;color:#fcfdff;font-family:Inter,-apple-system,sans-serif;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#0a0a0c;border:1px solid rgba(255,255,255,0.14);border-radius:12px;
  padding:32px;width:100%;max-width:400px}
.logo{font-size:13px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;
  color:rgba(252,253,255,0.4);margin-bottom:24px}
h1{font-size:20px;font-weight:500;letter-spacing:-.3px;line-height:1.3;margin-bottom:20px}
.net-list{display:flex;flex-direction:column;gap:6px;margin-bottom:16px;
  max-height:220px;overflow-y:auto}
.net{display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;background:#000;border:1px solid rgba(255,255,255,0.06);
  border-radius:8px;cursor:pointer;font-size:14px;color:rgba(252,253,255,0.86);
  transition:border-color .12s}
.net:hover{border-color:rgba(255,255,255,0.14)}
.net.sel{border-color:#fcfdff;color:#fcfdff}
.bars{display:flex;gap:2px;align-items:flex-end}
.bars span{width:3px;border-radius:1px;background:rgba(255,255,255,0.2)}
.bars span.on{background:#fcfdff}
.b1{height:4px}.b2{height:8px}.b3{height:12px}.b4{height:16px}
input{width:100%;background:#0a0a0c;border:1px solid rgba(255,255,255,0.14);
  border-radius:8px;color:#fcfdff;font-family:inherit;font-size:14px;
  padding:10px 14px;height:40px;outline:none;margin-bottom:14px}
input:focus{border-color:#fcfdff}
input::placeholder{color:rgba(255,255,255,0.25)}
.btn{width:100%;height:36px;background:#fcfdff;color:#000;border:none;
  border-radius:8px;font-family:inherit;font-size:14px;font-weight:500;
  cursor:pointer;transition:background .12s}
.btn:hover{background:#f1f7fe}
.btn:disabled{background:rgba(252,253,255,0.15);color:rgba(0,0,0,0.4);cursor:default}
.err{font-size:13px;color:#ff2047;margin-bottom:12px;display:none}
.muted{color:rgba(252,253,255,0.5);font-size:14px}
.spin-wrap{display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0}
.spin{width:32px;height:32px;border:2px solid rgba(255,255,255,0.1);
  border-top-color:#fcfdff;border-radius:50%;animation:rot .7s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
.code{font-size:40px;font-weight:500;letter-spacing:.22em;text-align:center;
  margin:24px 0 16px;font-variant-numeric:tabular-nums}
.status{display:flex;align-items:center;gap:8px;justify-content:center;
  font-size:14px;margin-bottom:8px}
.dot{width:8px;height:8px;border-radius:50%;background:#11ff99;flex-shrink:0}
.hint{font-size:12px;color:rgba(252,253,255,0.3);text-align:center}
a{color:#3b9eff;text-decoration:none}
#s-conn,#s-ok{display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Guidenco</div>

  <!-- State 1: pick network -->
  <div id="s-pick">
    <h1>Connect to WiFi</h1>
    <div class="net-list" id="net-list">
      <div class="muted" style="font-size:13px;padding:6px 0">Scanning…</div>
    </div>
    <input id="pw" type="password" placeholder="Password" autocomplete="current-password">
    <div class="err" id="err"></div>
    <button class="btn" id="btn-conn" disabled>Connect</button>
  </div>

  <!-- State 2: connecting -->
  <div id="s-conn">
    <h1>Connecting</h1>
    <div class="spin-wrap">
      <div class="spin"></div>
      <p class="muted" id="conn-label">Connecting…</p>
    </div>
  </div>

  <!-- State 3: paired -->
  <div id="s-ok">
    <h1>Enter this code in the Guidenco app</h1>
    <div class="code" id="code-val">––––––</div>
    <div class="status"><div class="dot"></div><span>Connected</span></div>
    <p class="hint">You can disconnect from Guidenco-Setup now</p>
  </div>
</div>

<script>
var sel=null;
function bars(dbm){var p=Math.max(0,Math.min(100,(dbm+90)*100/60));return p>75?4:p>50?3:p>25?2:1}
function render(nets){
  var el=document.getElementById('net-list');
  if(!nets.length){el.innerHTML='<div class="muted" style="font-size:13px">No networks found. <a href="#" onclick="doScan();return false">Retry</a></div>';return}
  el.innerHTML=nets.map(function(n){
    var b=bars(n.signal);
    var bh=[1,2,3,4].map(function(i){return'<span class="b'+i+(i<=b?' on':'')+'"></span>'}).join('');
    return'<div class="net" data-ssid="'+esc(n.ssid)+'" onclick="pick(this)"><span>'+esc(n.ssid)+'</span><div class="bars">'+bh+'</div></div>'
  }).join('');
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function pick(el){
  document.querySelectorAll('.net').forEach(function(n){n.classList.remove('sel')});
  el.classList.add('sel');sel=el.dataset.ssid;
  document.getElementById('btn-conn').disabled=false;
  document.getElementById('pw').focus();
}
function show(s){['pick','conn','ok'].forEach(function(x){document.getElementById('s-'+x).style.display=x===s?'':'none'})}
function doScan(){
  fetch('/scan').then(function(r){return r.json()}).then(function(d){render(d.networks||[])}).catch(function(){render([])});
}
document.getElementById('btn-conn').onclick=function(){
  if(!sel)return;
  document.getElementById('err').style.display='none';
  document.getElementById('conn-label').textContent='Connecting to '+sel+'…';
  show('conn');
  fetch('/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:sel,password:document.getElementById('pw').value})})
    .then(function(r){return r.json()})
    .then(function(d){
      if(d.ok){document.getElementById('code-val').textContent=d.code;show('ok')}
      else{show('pick');var e=document.getElementById('err');e.textContent=d.error||'Connection failed. Check your password.';e.style.display='block'}
    })
    .catch(function(){show('pick');var e=document.getElementById('err');e.textContent='Something went wrong. Please try again.';e.style.display='block'});
};
document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('btn-conn').click()});
doScan();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add pi-agent/portal/index.html
git commit -m "feat(portal): setup UI — WiFi picker, connecting, pairing code states"
```

---

## Task 5: HTTP request handler

**Files:**
- Create: `pi-agent/portal/handler.py`

- [ ] **Step 1: Create `handler.py`**

```python
# pi-agent/portal/handler.py
"""
HTTP request handler for the Guidenco captive portal.

Serves the setup UI on / and handles:
  GET  /scan     — list nearby WiFi networks
  POST /connect  — connect to WiFi + register device + return pairing code
  GET  /status   — internet connectivity check (polled by UI)

All other paths (captive portal detection probes from iOS/Android/Windows)
receive a 302 → http://192.168.4.1/ which triggers the system portal popup.
"""
import http.server
import json
import logging
import os
import threading

from .cloud import register, poll_until_claimed
from .wifi import scan, connect

logger = logging.getLogger("guidenco.portal.handler")

_INDEX = os.path.join(os.path.dirname(__file__), "index.html")
_PORTAL_IP = "192.168.4.1"

# Known captive-portal detection endpoints — iOS, Android, Windows all hit these.
# Any request whose Host header is one of these (or whose path we don't own) gets
# redirected to /, triggering the OS popup.
_KNOWN_PATHS = {"/", "/scan", "/connect", "/status"}


class PortalHandler(http.server.BaseHTTPRequestHandler):
    # Set by run_server() before the server starts
    cloud_url: str = "https://guidenco.app"
    teardown_cb = None   # called with no args once device is claimed

    # ── logging ──────────────────────────────────────────────────────────────
    def log_message(self, fmt, *args):
        logger.debug(fmt, *args)

    # ── helpers ───────────────────────────────────────────────────────────────
    def _redirect(self, to: str = "/") -> None:
        self.send_response(302)
        self.send_header("Location", f"http://{_PORTAL_IP}{to}")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_captive_probe(self) -> bool:
        """True if this request looks like an OS captive-portal probe."""
        path = self.path.split("?")[0]
        return path not in _KNOWN_PATHS

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self) -> None:
        path = self.path.split("?")[0]

        if self._is_captive_probe():
            self._redirect()
            return

        if path == "/":
            with open(_INDEX, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path == "/scan":
            self._json({"networks": scan()})

        elif path == "/status":
            import subprocess
            r = subprocess.run(["ping", "-c1", "-W2", "1.1.1.1"],
                               capture_output=True, timeout=5)
            self._json({"internet": r.returncode == 0})

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self) -> None:
        if self.path != "/connect":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json({"ok": False, "error": "Bad request"}, 400)
            return

        ssid: str = body.get("ssid", "").strip()
        password: str = body.get("password", "")

        if not ssid:
            self._json({"ok": False, "error": "SSID is required"}, 400)
            return

        logger.info(f"Attempting to connect to '{ssid}'")

        if not connect(ssid, password):
            self._json({"ok": False,
                        "error": "Could not connect. Check your password and try again."})
            return

        try:
            device_id, code = register(self.cloud_url)
        except Exception as e:
            logger.exception("Cloud registration failed")
            self._json({"ok": False,
                        "error": "Connected to WiFi but cloud registration failed. Please retry."})
            return

        self._json({"ok": True, "code": code})

        # Poll for claim in background so the response is returned immediately
        threading.Thread(
            target=poll_until_claimed,
            args=(self.cloud_url, device_id, self._on_claimed),
            daemon=True,
        ).start()

    def _on_claimed(self, token: str) -> None:
        logger.info("Device claimed — calling teardown")
        if self.teardown_cb:
            try:
                self.teardown_cb()
            except Exception:
                logger.exception("Teardown callback failed")
```

- [ ] **Step 2: Commit**

```bash
git add pi-agent/portal/handler.py
git commit -m "feat(portal): HTTP handler — /scan, /connect, /status + captive redirects"
```

---

## Task 6: Boot orchestrator (`captive.py`)

**Files:**
- Create: `pi-agent/captive.py`

- [ ] **Step 1: Create `captive.py`**

```python
#!/usr/bin/env python3
"""
captive.py — Guidenco boot orchestrator.

Runs as a one-shot systemd service before guidenco.service.
Checks for internet connectivity; if none, starts the captive portal
so the user can configure WiFi and pair the device from a phone.
"""
import http.server
import logging
import os
import subprocess
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] guidenco.captive: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("guidenco.captive")

INTERNET_TIMEOUT = 30        # seconds to wait for internet on boot
PING_HOSTS = ("1.1.1.1", "8.8.8.8")
HOTSPOT_SCRIPT = os.path.join(os.path.dirname(__file__), "portal", "hotspot.sh")
CLOUD_URL = os.environ.get("CLOUD_URL", "https://guidenco.app")


def _ping_ok(host: str) -> bool:
    r = subprocess.run(["ping", "-c1", "-W2", host],
                       capture_output=True, timeout=5)
    return r.returncode == 0


def check_internet(timeout: int = INTERNET_TIMEOUT) -> bool:
    logger.info(f"Checking internet ({timeout}s timeout)…")
    deadline = time.time() + timeout
    while time.time() < deadline:
        for host in PING_HOSTS:
            if _ping_ok(host):
                logger.info(f"Internet OK (reached {host})")
                return True
        time.sleep(3)
    logger.warning("No internet detected")
    return False


def run_hotspot(action: str) -> None:
    subprocess.run(["bash", HOTSPOT_SCRIPT, action], check=True)


def run_portal() -> None:
    from portal.handler import PortalHandler

    server = http.server.HTTPServer(("0.0.0.0", 80), PortalHandler)

    def _teardown():
        logger.info("Tearing down hotspot…")
        run_hotspot("stop")
        server.shutdown()   # unblocks serve_forever() below

    PortalHandler.cloud_url = CLOUD_URL
    PortalHandler.teardown_cb = _teardown

    logger.info("Captive portal listening on :80")
    server.serve_forever()   # blocks until _teardown calls server.shutdown()


if __name__ == "__main__":
    if check_internet():
        logger.info("Internet available — captive portal not needed")
        sys.exit(0)

    logger.info("Starting captive portal…")
    try:
        run_hotspot("start")
        run_portal()   # blocks until device is claimed
    except Exception:
        logger.exception("Portal error")
        run_hotspot("stop")
        sys.exit(1)

    logger.info("Setup complete")
    sys.exit(0)
```

- [ ] **Step 2: Commit**

```bash
git add pi-agent/captive.py
git commit -m "feat(portal): boot orchestrator — internet check + captive portal dispatch"
```

---

## Task 7: Systemd service + update guidenco.service

**Files:**
- Create: `pi-agent/guidenco-portal.service`
- Modify: `pi-agent/guidenco.service`

- [ ] **Step 1: Create `guidenco-portal.service`**

```ini
[Unit]
Description=Guidenco — WiFi setup portal (runs before agent on every boot)
After=network.target
Before=guidenco.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/guidenco
ExecStart=/opt/guidenco/venv/bin/python3 /opt/guidenco/captive.py
EnvironmentFile=-/etc/guidenco/device.env
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal
# Allow plenty of time — user may take a few minutes to open the portal
TimeoutStartSec=1200

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Update `guidenco.service` — add `After=` dependency**

In `pi-agent/guidenco.service`, update the `[Unit]` section:

```ini
[Unit]
Description=Guidenco — vision-driven remote desktop automation
After=network-online.target guidenco-portal.service
Wants=network-online.target
```

(Only the `After=` line changes — add `guidenco-portal.service` to it.)

- [ ] **Step 3: Commit**

```bash
git add pi-agent/guidenco-portal.service pi-agent/guidenco.service
git commit -m "feat(portal): systemd service — portal runs before guidenco agent"
```

---

## Task 8: Update install.sh

**Files:**
- Modify: `pi-agent/install.sh`

- [ ] **Step 1: Add `hostapd dnsmasq` to the apt install line**

Find the existing install line:
```bash
sudo apt-get install -y -q --no-install-recommends python3 python3-venv ffmpeg v4l-utils curl
```
Replace with:
```bash
sudo apt-get install -y -q --no-install-recommends \
  python3 python3-venv ffmpeg v4l-utils curl \
  hostapd dnsmasq wireless-tools iw
```

- [ ] **Step 2: Mask hostapd + dnsmasq auto-start after apt install**

After the apt install block, add:

```bash
# Prevent hostapd and dnsmasq from auto-starting — guidenco-portal.service
# starts them only when there is no internet on boot.
info "Masking hostapd and dnsmasq system services (managed by Guidenco)..."
sudo systemctl mask hostapd dnsmasq
```

- [ ] **Step 3: Install + enable the portal service**

In section `── 9. systemd service ──`, after the existing service copy:

```bash
info "Installing systemd services..."
sudo cp "$INSTALL_DIR/guidenco.service" "$SERVICE_FILE"
sudo cp "$INSTALL_DIR/guidenco-portal.service" /etc/systemd/system/guidenco-portal.service
sudo systemctl daemon-reload
sudo systemctl enable guidenco.service guidenco-portal.service
```

- [ ] **Step 4: Commit**

```bash
git add pi-agent/install.sh
git commit -m "feat(portal): install.sh — add hostapd/dnsmasq, enable portal service"
```

---

## Task 9: Manual integration test on Pi

- [ ] **Step 1: Run the installer on the Pi**

```bash
curl -fsSL https://guidenco.app/install.sh | sudo bash
```

Or for local dev:
```bash
sshpass -p '191996' ssh ronnel@pi1.local \
  'curl -fsSL http://<your-mac-ip>:3001/install.sh | sudo bash'
```

- [ ] **Step 2: Verify portal service installed and enabled**

```bash
sshpass -p '191996' ssh ronnel@pi1.local \
  'systemctl status guidenco-portal.service'
```
Expected: `enabled; vendor preset: enabled`

- [ ] **Step 3: Test captive portal — simulate no internet**

```bash
sshpass -p '191996' ssh ronnel@pi1.local \
  'sudo systemctl stop guidenco.service && \
   sudo CLOUD_URL=https://guidenco.app /opt/guidenco/venv/bin/python3 /opt/guidenco/captive.py'
```

On your phone, look for the `Guidenco-Setup` WiFi network. Connect to it — the setup page should pop automatically.

- [ ] **Step 4: Verify captive portal popup on iPhone/Android**

Connect phone to `Guidenco-Setup`. Within ~5 s the OS should present the captive portal page. If it doesn't, open `http://192.168.4.1` manually.

- [ ] **Step 5: Complete WiFi setup flow**

Pick your home WiFi, enter `19961996`, tap Connect. Confirm:
- Spinner appears
- Pi connects to WiFi
- 6-character pairing code appears

- [ ] **Step 6: Verify hotspot teardown after pairing**

Enter the code in the Guidenco dashboard. After claiming:
- `Guidenco-Setup` SSID disappears
- `journalctl -u guidenco-portal` shows "Device claimed — tearing down hotspot"
- `journalctl -u guidenco.service` shows agent starting

- [ ] **Step 7: Reboot test — verify portal skipped when WiFi works**

```bash
sudo reboot
```

After reboot:
```bash
journalctl -u guidenco-portal --no-pager | tail -5
```
Expected: `Internet OK (reached 1.1.1.1)` → `captive portal not needed`

- [ ] **Step 8: Final commit + tag**

```bash
git add -A
git commit -m "feat: captive portal WiFi setup — headless first-run configuration"
```
