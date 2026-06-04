# Captive Portal WiFi Setup — Design Spec
_Date: 2026-06-04_

## Problem

The Pi is headless. A fresh flash has no WiFi credentials. Today the only
recovery path is: pull SD card → edit `network-config` → re-insert. That is
unacceptable for a consumer device.

## Goal

On every boot, detect whether the Pi has internet. If not, fall back to an
access-point mode that lets the user configure WiFi and receive their pairing
code — entirely from a phone browser, without touching the SD card.

---

## Architecture

### Boot sequence

```
boot
 └─ guidenco-setup.service  (runs before guidenco.service)
     ├─ check_internet()     (30 s timeout, ping 1.1.1.1 + 8.8.8.8)
     ├─ internet OK  ──────► exit 0  (guidenco.service starts normally)
     └─ no internet  ──────► start captive portal
```

### Captive portal stack

| Layer | Tool | Role |
|---|---|---|
| Virtual AP iface | `iw dev wlan0 interface add uap0 type __ap` | Creates virtual AP alongside client — Pi 4's Broadcom chip supports concurrent AP+station mode |
| Access point | `hostapd` on `uap0` | Creates `Guidenco-Setup` SSID (no password, 2.4 GHz) |
| DHCP + DNS | `dnsmasq` on `uap0` | Hands out `192.168.4.x`, redirects all DNS → `192.168.4.1` |
| Web server | Python `http.server` (stdlib) | Serves setup UI on port 80 |
| WiFi scan | `iwlist wlan0 scan` | Returns SSID list for the picker |
| WiFi connect | writes `wpa_supplicant.conf` + `wpa_cli reconfigure` | Applies new credentials live |
| Internet check | `ping -c2 -W3 1.1.1.1` | Confirms connection succeeded |
| Cloud register | `POST /api/devices/claim-init` | Gets pairing code after connectivity confirmed |

No Flask or external dependencies — stdlib `http.server` + `urllib` only, keeping
`requirements.txt` unchanged.

---

## Files

```
pi-agent/
  setup.py            ← new: orchestrates internet check + captive portal
  setup/
    portal.py         ← new: HTTP request handler (serves UI, handles /connect, /scan)
    hotspot.sh        ← new: hostapd/dnsmasq start/stop helpers
    index.html        ← new: setup UI (self-contained HTML + inline CSS/JS)
  guidenco-setup.service  ← new: systemd unit (runs before guidenco.service)
  install.sh          ← updated: installs hostapd + dnsmasq, registers new service
```

---

## UI (index.html)

Single self-contained HTML file served from the Pi. Three states rendered
client-side (no page reloads):

### State 1 — WiFi picker
- Guidenco wordmark (top, white, Inter 500)
- Heading: "Connect to WiFi" (Inter 500, 20px)
- Scanned network list: each row is a `surface-card` chip (`#0a0a0c`,
  `border: 1px solid rgba(255,255,255,0.14)`, `rounded: 8px`) showing SSID +
  signal bars icon. Selected row gets `border-color: #fcfdff`.
- Password input (`surface-card`, `rounded: 8px`, `height: 40px`)
- "Connect" button (white primary, `#fcfdff` bg, black text, `rounded: 8px`)
- Canvas: `#000000`. All on a centered card max-width 400px.

### State 2 — Connecting
- Spinner (CSS only, white ring on black)
- "Connecting to {SSID}…" in `rgba(252,253,255,0.7)`

### State 3 — Paired
- Large pairing code (Inter 500, 40px, white, letter-spacing 0.2em)
- Label: "Enter this code in the Guidenco app" (`rgba(252,253,255,0.7)`, 14px)
- Green status dot + "Connected" line
- Subtext: "You can disconnect from Guidenco-Setup now" (muted, 12px)

Design tokens used: `canvas #000000`, `surface-card #0a0a0c`,
`hairline-strong rgba(255,255,255,0.14)`, `ink #fcfdff`,
`body rgba(252,253,255,0.86)`, `accent-green #11ff99`, `rounded.md 8px`.

---

## API endpoints (portal.py)

| Method | Path | Action |
|---|---|---|
| `GET` | `/` | Serve `index.html` |
| `GET` | `/scan` | Return JSON `{networks: [{ssid, signal}]}` from `iwlist` |
| `POST` | `/connect` | Body `{ssid, password}`. Write WPA config, reconnect, check internet, register device. Returns `{ok, code?, error?}` |
| `GET` | `/status` | Returns `{internet: bool}` — polled by UI |

---

## Captive Portal Detection

iOS, Android, and Windows all make an HTTP GET to a known URL on connect
(e.g. `captive.apple.com`, `connectivitycheck.gstatic.com`). `dnsmasq` resolves
all DNS to `192.168.4.1`; our server returns `HTTP 302 → /` for any unrecognised
host/path. This triggers the system captive portal popup automatically on
iPhone and Android without the user having to type a URL.

---

## Teardown

After `/connect` returns success:
1. Pairing code displayed in the browser (user enters in app)
2. `setup.py` polls `GET /api/devices/claim-status` every 5s
3. Once status = `claimed`, kills hostapd/dnsmasq, removes `uap0`, exits
4. `guidenco.service` has already started (it runs once internet is confirmed)
   and picks up the token from `/etc/guidenco/device.env`

---

## install.sh changes

- `apt-get install hostapd dnsmasq` (with `--no-install-recommends`)
- `systemctl mask hostapd dnsmasq` after install (prevent auto-start; setup.py
  starts them only when needed)
- Copy `guidenco-setup.service` + enable it (`Before=guidenco.service`)

---

## Custom Pi Image (separate sub-project)

After the captive portal ships, the second request is a pre-baked Raspberry Pi
OS image. Approach:
1. Find the `.img.xz` in RPi Imager's local cache (`~/Library/Caches/Raspberry Pi/`)
2. Decompress + mount (macOS `hdiutil`)
3. Copy pi-agent files into the rootfs, install systemd units
4. Re-seal and compress
This gets its own spec once the captive portal is working.

---

## Success Criteria

- [ ] Fresh-flashed Pi with no WiFi config → `Guidenco-Setup` SSID appears within 60s of boot
- [ ] iPhone connecting to `Guidenco-Setup` auto-opens the setup page
- [ ] User picks WiFi + enters password → Pi connects → pairing code shown
- [ ] Pi with working WiFi → hotspot never starts, Guidenco agent starts normally
- [ ] Wrong password → error shown inline, user can retry
