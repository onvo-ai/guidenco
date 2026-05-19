import json
import logging
import time

from tools.get_screenshot_capture_card import get_screenshot_capture_card
from tools.send_keyboard_events_usb import send_keyboard_events as send_usb

from settings_store import load_settings
from .actions import (
    tool_to_action, normalize_actions, describe_action, action_signature,
    action_to_usb_actions, get_action_delay,
)
from .prompts import build_system_prompt
from .vlm import vlm_step, screenshot_to_b64, cleanup_temp, _emit_viz

logger = logging.getLogger("guidenco")

MAX_STEPS = 100


def _get_timeout():
    try:
        return int(load_settings().get("agent", {}).get("timeout_seconds", 180))
    except Exception:
        return 180


def _cancelled(cancel_event):
    return cancel_event is not None and cancel_event.is_set()


def _execute_action(action):
    """Execute a raw VLM action (coord-space 1-1000) via send_usb directly."""
    usb_actions = action_to_usb_actions(action)
    if usb_actions is None:
        logger.warning(f"[agent-exec] No mapping for action type '{action.get('type')}': {action}")
        return {"status": "error:unknown_type"}

    logger.info(f"[agent-exec] usb_actions={usb_actions}")
    results = send_usb(usb_actions)
    logger.info(f"[agent-exec] results={results}")
    return results


def run(goal, cancel_event=None, instructions=""):
    logger.info(f"Goal: {goal}\n")
    cleanup_temp()

    history = []
    prev_signatures = []
    loop_warning = None
    todo_items = []
    timeout_seconds = _get_timeout()
    start_time = time.time()

    for step in range(1, MAX_STEPS + 1):
        if _cancelled(cancel_event):
            logger.warning("CANCELLED: Stop requested.")
            return
        elapsed = time.time() - start_time
        if elapsed > timeout_seconds:
            logger.error(f"TIMEOUT: Agent exceeded {timeout_seconds}s limit.")
            _emit_viz("task_result", result=f"Timed out after {timeout_seconds}s", success=False)
            return
        screenshot_path = get_screenshot_capture_card()
        if not screenshot_path:
            logger.error("FAILED: Could not capture screenshot.")
            return

        system_prompt = build_system_prompt(instructions=instructions)
        screenshot_b64 = screenshot_to_b64(screenshot_path)

        try:
            message, reasoning, todo_items = vlm_step(
                goal, screenshot_b64, history, system_prompt,
                todo_items=todo_items,
                loop_warning=loop_warning,
            )
        except Exception as e:
            logger.exception(f"VLM error: {e}")
            continue

        if reasoning:
            history.append(f"[reasoning] {reasoning[:600]}")

        tool_calls = message.tool_calls or []
        if not tool_calls:
            logger.warning("No tool calls returned, skipping step")
            continue

        done = False
        done_result = ""
        done_success = True
        raw_actions = []
        prev_todo_count = len(todo_items)
        prev_todo_snapshot = [item.get("text", "") + (":done" if item.get("done") else "") for item in todo_items]

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                logger.warning(f"Bad JSON in {name}: {tc.function.arguments}")
                continue

            if name == "task_done":
                incomplete = [item for item in todo_items if not item.get("done")]
                if incomplete:
                    incomplete_names = "; ".join(item.get("text", "?") for item in incomplete)
                    logger.warning(f"task_done rejected — {len(incomplete)} incomplete todo items: {incomplete_names}")
                    _emit_viz("task_result", result=f"Incomplete: {incomplete_names}", success=False)
                    loop_warning = (
                        f"CANNOT FINISH: {len(incomplete)} todo item(s) are still open: {incomplete_names}. "
                        "You MUST call complete_todo_item for each completed item and continue working on the remaining items. "
                        "Do NOT call task_done until every item is marked done."
                    )
                else:
                    done = True
                    done_result = args.get("result", "")
                    done_success = args.get("success", True)
            else:
                action = tool_to_action(name, args)
                if action:
                    raw_actions.append(action)

        todo_changed = len(todo_items) != prev_todo_count or any(
            item.get("text", "") + (":done" if item.get("done") else "") != prev_todo_snapshot[i]
            for i, item in enumerate(todo_items) if i < len(prev_todo_snapshot)
        )

        if todo_changed:
            _emit_viz("todo_state", items=todo_items)
            summary = ", ".join(
                f"[{'x' if item.get('done') else ' '}] {item.get('text', '')}"
                for item in todo_items
            ) or "(empty)"
            history.append(f"[todo] {summary[:600]}")

        if not todo_items and not todo_changed:
            logger.warning("Initial planning step did not produce a todo list")

        if todo_changed and not raw_actions and not done:
            logger.info("Planning step completed; advancing to next step")
            continue

        # Cap at 5 actions per step to prevent runaway sequences
        if len(raw_actions) > 5:
            logger.info(f"Capping {len(raw_actions)} actions to 5")
            raw_actions = raw_actions[:5]

        actions = normalize_actions(raw_actions)

        logger.info("=== Raw VLM actions ===")
        for raw_a in raw_actions:
            logger.info(f"  {raw_a}")
        logger.info("=== Normalized actions ===")
        for norm_a in actions:
            logger.info(f"  {describe_action(norm_a)}")

        action_desc = ", ".join(describe_action(a) for a in actions)
        if action_desc:
            logger.info(action_desc)

        sig = action_signature(actions)
        loop_warning = None

        # Detect repeated single action (3 in a row)
        stuck_single = (len(prev_signatures) >= 2 and sig and
                        sig == prev_signatures[-1] == prev_signatures[-2])

        # Detect repeated sequence of 2-4 steps (pattern repeats twice)
        stuck_seq = False
        if not stuck_single and len(prev_signatures) >= 4:
            for pat_len in (2, 3, 4):
                if len(prev_signatures) >= pat_len * 2:
                    pattern = prev_signatures[-pat_len:]
                    prev    = prev_signatures[-pat_len * 2:-pat_len]
                    if pattern == prev:
                        stuck_seq = True
                        break

        if stuck_single or stuck_seq:
            logger.warning("Loop detected — auto-sending Escape to reset UI state")
            _execute_action({"type": "key", "key": "escape"})
            time.sleep(1.0)
            stuck_type = raw_actions[0].get("type") if raw_actions else ""
            if stuck_type in ("type_text", "type"):
                loop_warning = (
                    "STUCK: Text entry has failed repeatedly. "
                    "An Escape key was automatically sent. "
                    "The input field is likely not focused. "
                    "You MUST click directly on the input field first to activate it, then type again."
                )
            else:
                loop_warning = (
                    "STUCK: The same sequence of actions has been repeated with no progress. "
                    "An Escape key was automatically sent. "
                    "You MUST try a completely different approach — do NOT repeat the same actions. "
                    "Think about why it is not working and try something new."
                )

        if sig:
            prev_signatures.append(sig)

        if done:
            _emit_viz("task_result", result=done_result, success=done_success)
            logger.info(f"{'SUCCESS' if done_success else 'FAILED'}: {done_result}")
            return

        if raw_actions:
            if _cancelled(cancel_event):
                logger.warning("CANCELLED: Stop requested before executing actions.")
                return
            for i, raw_a in enumerate(raw_actions):
                atype = raw_a.get("type")
                if atype == "wait":
                    secs = raw_a.get("seconds", 1)
                    logger.info(f"[agent-exec] wait({secs}s)")
                    time.sleep(secs)
                    history.append(f"wait({secs}s)")
                    continue
                desc = describe_action(raw_a)
                results = _execute_action(raw_a)
                if results:
                    ok = all(r.get("status") == "ok" for r in results)
                    history.append(f"{desc} [error]" if not ok else desc)
                else:
                    history.append(desc)
                # inter-action delay (skip after last — end-of-step delay handles that)
                if i < len(raw_actions) - 1:
                    delay = get_action_delay(atype, raw_a.get("key"))
                    time.sleep(delay)
            last_action = raw_actions[-1] if raw_actions else None
            if last_action:
                atype = last_action.get("type")
                if atype == "wait":
                    pass  # wait() already slept
                else:
                    delay = get_action_delay(atype, last_action.get("key"))
                    time.sleep(delay)

    logger.error(f"FAILED: Reached max steps ({MAX_STEPS}).")
