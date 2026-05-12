---
name: guidenco-remote-control
description: Use this skill when the user wants to control the remote Windows machine, automate tasks on the Windows PC, or use Guidenco to do something on the computer. Triggers include: "open X on the PC", "go to website Y", "automate this on the computer", "use the computer to", "run this on Windows", "control the remote machine".
---

# Guidenco Remote Control

You control a remote Windows PC via the Guidenco API at `https://bot.ronnel.cloud`. All routes are under `/api`.

## Workflow

### 1. Take an initial screenshot

```bash
curl -s "https://bot.ronnel.cloud/api/display/screenshot" -o /tmp/guidenco_screen.jpg
```

Read the screenshot to understand the current state of the screen before planning.

### 2. Plan sub-tasks

Break the user's goal into **2–5 sub-tasks**. Each must be a focused action the Guidenco VLM agent can complete reliably on its own. Cap at 5. If the goal needs more, pick the most important 5 first.

Good sub-task examples for "search Google for Apple stock price":
1. Open Chrome
2. Navigate to google.com
3. Search for "Apple stock price AAPL"

### 3. Execute each sub-task in sequence

For each sub-task, run this and **wait for it to finish** before starting the next:

```bash
curl -sN "https://bot.ronnel.cloud/api/agent/action?q=<TASK_DESCRIPTION>"
```

The command streams SSE and exits when the agent completes the task. Do not start the next task until the current curl exits.

### 4. Verify with a screenshot

After **all** sub-tasks are done, take one screenshot:

```bash
curl -s "https://bot.ronnel.cloud/api/display/screenshot" -o /tmp/guidenco_screen_final.jpg
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
- **ALL** execution goes through `/api/agent/action`
- **Screenshots only** via `/api/display/screenshot`
- **Max 5 sub-tasks** per execution loop
