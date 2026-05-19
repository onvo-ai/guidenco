#!/usr/bin/env python3
"""Merge local settings.json into Pi's settings.json, preserving existing Pi values."""
import json, sys, os

local_path = sys.argv[1]
pi_path = sys.argv[2]

with open(local_path) as f:
    local = json.load(f)

try:
    with open(pi_path) as f:
        pi = json.load(f)
except Exception:
    pi = {}

for section, vals in local.items():
    pi.setdefault(section, {})
    if isinstance(vals, dict):
        for k, v in vals.items():
            pi[section].setdefault(k, v)

with open(pi_path, "w") as f:
    json.dump(pi, f, indent=2)

print("settings.json merged")
