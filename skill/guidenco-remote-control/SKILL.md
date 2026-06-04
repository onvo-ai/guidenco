---
name: guidenco-remote-control
description: Use this skill when the user wants to control the remote Windows machine, automate tasks on the Windows PC, or use Guidenco to do something on the computer. Triggers include: "open X on the PC", "go to website Y", "automate this on the computer", "use the computer to", "run this on Windows", "control the remote machine".
---

# Guidenco Remote Control

You control a remote Windows PC via the Guidenco API at `https://openclaw.ai`. All routes are under `/api`.

## Workflow

### 1. Take an initial screenshot

```bash
curl -s "https://openclaw.ai/api/display/screenshot" -o /tmp/guidenco_screen.jpg
```

Read the screenshot to understand the current state of the screen before planning.

### 2. Plan sub-tasks

Break the user's goal into **2–5 sub-tasks**. Each must be a focused action the Guidenco VLM agent can complete reliably on its own. Cap at 5. If the goal needs more, pick the most important 5 first.

Good sub-task examples for "search Google for Apple stock price":
1. Open Chrome
2. Navigate to google.com
3. Search for "Apple stock price AAPL"

### 3. Enqueue all sub-tasks at once

Post each sub-task to the queue in order. The server runs them sequentially — no need to wait between calls:

```bash
curl -s -X POST "https://openclaw.ai/api/agent/queue" -d "q=<TASK_1_DESCRIPTION>"
curl -s -X POST "https://openclaw.ai/api/agent/queue" -d "q=<TASK_2_DESCRIPTION>"
# ... repeat for each sub-task
```

Each call returns immediately with a `job_id`. The agent processes them in the order they were posted.

Then wait for the queue to drain:

```bash
until curl -s "https://openclaw.ai/api/agent/queue" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d['current'] is None and not d['pending'] else 1)"; do sleep 5; done
```

### 4. Verify with a screenshot

After **all** sub-tasks are done, take one screenshot:

```bash
curl -s "https://openclaw.ai/api/display/screenshot" -o /tmp/guidenco_screen_final.jpg
```

Read it to verify the goal is complete.

### 5. Retry if incomplete

If the goal isn't done, refine the task list and try again:
- Be more specific: describe button location, color, text label, or approximate position on screen (e.g. "click the blue Search button in the center of the screen")
- Split large tasks into smaller ones
- Use what you saw in the screenshot to write better task descriptions
- Loop back to step 3

### 6. Report

Summarize what was accomplished and show the final screenshot to the user.

## Hard Rules

- **NEVER** call `/api/mouse/click`, `/api/keyboard/type`, `/api/keyboard/key`, `/api/mouse/move`, or any other low-level endpoint directly
- **ALL** execution goes through `POST /api/agent/queue` — enqueue each sub-task, then wait for the queue to drain
- **Screenshots only** via `/api/display/screenshot`
- **Max 5 sub-tasks** per execution loop
