import json
import os
import subprocess
import urllib.request

from flask import request

from .helpers import err, ok

SETTINGS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "settings.json"
)

DEFAULTS = {
    "network": {"type": "wifi", "ssid": "", "password": ""},
    "io": {"input": "hdmi", "output": "usb", "machine": "windows"},
    "llm": {
        "provider": "ollama_cloud",
        "url": "https://ollama.com/v1",
        "model": "qwen3-vl:235b-instruct-cloud",
        "api_key": "",
    },
    "instructions": {"additionalInstructions": ""},
}

PROVIDER_URLS = {
    "ollama_cloud": "https://ollama.com/v1",
    "ollama":       "http://localhost:11434/v1",
    "openai":       "https://api.openai.com/v1",
    "anthropic":    "https://api.anthropic.com/v1",
    "openrouter":   "https://openrouter.ai/api/v1",
}


def _load():
    try:
        with open(SETTINGS_PATH) as f:
            data = json.load(f)
        # merge in any missing keys
        for section, vals in DEFAULTS.items():
            data.setdefault(section, {})
            for k, v in vals.items():
                data[section].setdefault(k, v)
        return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {s: dict(v) for s, v in DEFAULTS.items()}


def _save(data):
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)


def register_routes(app):
    @app.route("/settings", methods=["GET"])
    def get_settings():
        settings = _load()
        # enrich network section with live SSID
        live_ssid = _get_live_ssid()
        settings["network"]["live_ssid"] = live_ssid
        return ok(data=settings)

    @app.route("/settings", methods=["POST"])
    def post_settings():
        body = request.get_json(silent=True) or {}
        settings = _load()
        for section, vals in body.items():
            if section in settings and isinstance(vals, dict):
                settings[section].update(vals)
        _save(settings)
        return ok()

    @app.route("/settings/network")
    def settings_network():
        settings = _load()
        ssid = settings["network"].get("ssid") or _get_live_ssid()
        return ok(data={"ssid": ssid})

    @app.route("/settings/wifi-networks")
    def wifi_networks():
        ssids = _scan_wifi()
        live = _get_live_ssid()
        return ok(data={"networks": ssids, "connected": live})

    @app.route("/settings/models")
    def get_models():
        settings = _load()
        llm = settings.get("llm", {})
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
        print(f"[settings] model fetch failed ({provider} @ {url}): {e}")
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
