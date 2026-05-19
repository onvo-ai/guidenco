"""Centralized runtime settings — single reader/writer for settings.json.

Imported by the server (routes_settings) and the agent (loop, vlm) so the
settings schema and provider URLs live in exactly one place.
"""
import json

from config import SETTINGS_PATH

PROVIDER_URLS = {
    "ollama_cloud": "https://ollama.com/v1",
    "ollama":       "http://localhost:11434/v1",
    "openai":       "https://api.openai.com/v1",
    "anthropic":    "https://api.anthropic.com/v1",
    "openrouter":   "https://openrouter.ai/api/v1",
}

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
    "agent": {"timeout_seconds": 180},
}

# Sentinel returned in place of stored secrets in API responses. When a client
# echoes this value back on save, the real stored secret is kept untouched —
# so the plaintext secret never has to leave the device.
SECRET_PLACEHOLDER = "__guidenco_secret_unchanged__"

# (section, field) pairs holding secrets — masked in every API response.
SECRET_FIELDS = (("llm", "api_key"), ("network", "password"))


def redact_secrets(settings):
    """Replace any set secret field with SECRET_PLACEHOLDER, in place.

    Call on a fresh load_settings() result before returning it over HTTP.
    """
    for section, field in SECRET_FIELDS:
        if settings.get(section, {}).get(field):
            settings[section][field] = SECRET_PLACEHOLDER
    return settings


def restore_secrets(incoming, stored):
    """Where `incoming` still carries the placeholder, copy the real value from
    `stored` — so a save that didn't touch a secret keeps the existing one.
    """
    for section, field in SECRET_FIELDS:
        if incoming.get(section, {}).get(field) == SECRET_PLACEHOLDER:
            incoming[section][field] = stored.get(section, {}).get(field, "")
    return incoming


def load_settings():
    """Read settings.json, filling in any missing default keys.

    Returns a fresh copy of DEFAULTS if the file is absent or malformed.
    """
    try:
        with open(SETTINGS_PATH) as f:
            data = json.load(f)
        for section, vals in DEFAULTS.items():
            data.setdefault(section, {})
            for k, v in vals.items():
                data[section].setdefault(k, v)
        return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {s: dict(v) for s, v in DEFAULTS.items()}


def save_settings(data):
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)
