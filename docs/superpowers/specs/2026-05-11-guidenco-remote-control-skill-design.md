# Guidenco Remote Control Skill — Design Spec

**Date:** 2026-05-11

## Overview

A Claude skill (`guidenco:remote-control`) that lets Claude control a remote Windows machine via the Guidenco API over the internet. Claude breaks goals into sub-tasks, delegates each to the Guidenco VLM agent, and verifies the final result with a screenshot.

---

## Architecture

```
Claude (Mac) → skill → https://bot.ronnel.cloud → Cloudflare Tunnel → Pi:5000 → Guidenco Flask server → VLM agent → USB HID → Windows PC
```

Three independent pieces:

1. **Cloudflare Tunnel** — exposes the Pi's Flask server publicly at `https://bot.ronnel.cloud`
2. **Claude skill** — instructs Claude on the workflow: plan → execute sub-tasks → verify
3. **Deploy script update** — automates cloudflared installation on the Pi

---

## Section 1: Cloudflare Tunnel

- `cloudflared` installed on the Pi via `apt`
- Service installed with: `sudo cloudflared service install <TOKEN>`
- Token stored in `.env.deploy` (gitignored), never committed
- Runs as a systemd service, starts on boot
- Permanently forwards `https://bot.ronnel.cloud` → `http://localhost:5000`
- No changes to the Flask server

A new `cloudflared-setup.sh` script handles installation. `deploy.sh` calls it as part of the normal deploy flow.

---

## Section 2: Claude Skill Workflow

The skill lives at `~/.claude/skills/guidenco-remote-control/SKILL.md`.

**Trigger:** User asks Claude to control the remote computer, automate a task on the Windows machine, or use Guidenco to do something.

**Workflow:**

1. **Initial screenshot** — `GET https://bot.ronnel.cloud/display/screenshot` to see current screen state
2. **Plan** — Break the user's goal into 2–5 sub-tasks. Each sub-task must be small enough for the Guidenco VLM agent to reliably complete on its own
3. **Execute** — For each sub-task in sequence:
   - `curl -sN "https://bot.ronnel.cloud/agent/action?q=<task>"` (streams SSE)
   - Wait for stream to end before starting the next task
4. **Verify** — After all sub-tasks complete, take a single screenshot to check the result
5. **Retry if incomplete** — If the goal isn't fully done, refine the task list:
   - Make descriptions more specific (include visual cues, button locations, coordinates from the screenshot)
   - Split tasks into smaller steps
   - Loop back to step 3
6. **Report** — Summarize what was accomplished and show the final screenshot

**Constraints enforced by the skill:**
- Never call low-level endpoints (`/mouse/click`, `/keyboard/type`, etc.) directly
- All execution goes through `/agent/action`
- Screenshots only via `/display/screenshot`
- Sub-task list capped at 5 to prevent agent overload

---

## Section 3: Skill File Location

```
~/.claude/skills/guidenco-remote-control/SKILL.md
```

No plugin registration needed — Claude discovers skills in `~/.claude/skills/` automatically.

---

## Section 4: Deploy Script Update

`cloudflared-setup.sh` (new file, committed to repo):
- Checks if `cloudflared` is installed; installs via apt if not
- Reads `CLOUDFLARE_TUNNEL_TOKEN` from `.env.deploy`
- Runs `sudo cloudflared service install $CLOUDFLARE_TUNNEL_TOKEN`
- Enables and starts `cloudflared.service`

`deploy.sh` updated to:
- Source `.env.deploy` if it exists
- Call `cloudflared-setup.sh` on the Pi via SSH after syncing files

`.env.deploy` (gitignored, user creates locally):
```
CLOUDFLARE_TUNNEL_TOKEN=<token from Cloudflare dashboard>
```

---

## Files Changed

| File | Action |
|------|--------|
| `~/.claude/skills/guidenco-remote-control/SKILL.md` | Create |
| `cloudflared-setup.sh` | Create |
| `deploy.sh` | Update — add cloudflared setup step |
| `.env.deploy` | User creates locally, gitignored |
| `.gitignore` | Verify `.env.deploy` is excluded |
