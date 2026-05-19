import json
import logging
import subprocess
import urllib.request

from flask import request

from settings_store import (
    load_settings, save_settings, redact_secrets, restore_secrets, PROVIDER_URLS
)
from .helpers import ok

logger = logging.getLogger("guidenco")


def register_routes(app):
    @app.route("/settings", methods=["GET"])
    def get_settings():
        settings = load_settings()
        # enrich network section with live SSID
        settings["network"]["live_ssid"] = _get_live_ssid()
        # never expose stored secrets (API key, Wi-Fi password) over HTTP
        return ok(data=redact_secrets(settings))

    @app.route("/settings", methods=["POST"])
    def post_settings():
        body = request.get_json(silent=True) or {}
        settings = load_settings()
        stored = {s: dict(v) for s, v in settings.items()}  # pristine, pre-update
        for section, vals in body.items():
            if section in settings and isinstance(vals, dict):
                settings[section].update(vals)
        # a client that echoed the placeholder back keeps the real secret
        restore_secrets(settings, stored)
        save_settings(settings)
        return ok()

    @app.route("/settings/network")
    def settings_network():
        settings = load_settings()
        ssid = settings["network"].get("ssid") or _get_live_ssid()
        return ok(data={"ssid": ssid})

    @app.route("/settings/wifi-networks")
    def wifi_networks():
        ssids = _scan_wifi()
        live = _get_live_ssid()
        return ok(data={"networks": ssids, "connected": live})

    @app.route("/settings/models")
    def get_models():
        llm = load_settings().get("llm", {})
        provider = llm.get("provider", "ollama")
        url = llm.get("url", "") or PROVIDER_URLS.get(provider, "")
        api_key = llm.get("api_key", "")
        models = _fetch_models(provider, url, api_key)
        return ok(data={"models": models})


def _get_live_ssid():
    try:
        r = subprocess.run(
            ["iwgetid", "-r"], capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            return r.stdout.strip()
    except Exception:
        pass
    return ""


def _fetch_models(provider, url, api_key):
    try:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        req = urllib.request.Request(
            f"{url.rstrip('/')}/models",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        ids = [m.get("id") or m.get("name", "") for m in data.get("data", data.get("models", []))]
        return [m for m in ids if m]
    except Exception as e:
        logger.warning(f"[settings] model fetch failed ({provider} @ {url}): {e}")
        return []


def _scan_wifi():
    try:
        r = subprocess.run(
            ["nmcli", "-t", "-f", "SSID", "device", "wifi", "list"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            seen = []
            for line in r.stdout.splitlines():
                ssid = line.strip()
                if ssid and ssid not in seen:
                    seen.append(ssid)
            return seen
    except Exception:
        pass
    return []
