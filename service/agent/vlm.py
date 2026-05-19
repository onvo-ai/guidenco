import base64
import json
import logging
import os
import time
import urllib.error
import urllib.request

from openai import OpenAI

from config import SCALE_RATIO, TEMP_DIR
from settings_store import load_settings, PROVIDER_URLS
from .prompts import build_tools
from .actions import VIZ_PREFIX

logger = logging.getLogger("guidenco")


def _load_llm_config():
    """Return (client, model, api_key, web_search_url) from settings.json, falling back to env vars."""
    llm = load_settings().get("llm", {})

    provider = llm.get("provider", "ollama_cloud")
    url      = llm.get("url", "") or PROVIDER_URLS.get(provider, "https://ollama.com/v1")
    model    = llm.get("model", "") or os.environ.get("GUIDENCO_MODEL", "qwen3-vl:235b-instruct-cloud")
    api_key  = llm.get("api_key", "") or os.environ.get("OLLAMA_API_KEY", "") or "missing"

    client = OpenAI(base_url=url, api_key=api_key)

    web_search_url = os.environ.get("OLLAMA_WEB_SEARCH_URL", "https://ollama.com/api/web_search")
    return client, model, api_key, web_search_url



def _emit_viz(kind, **data):
    payload = {"kind": kind}
    payload.update(data)
    logger.info(f"{VIZ_PREFIX}{json.dumps(payload, separators=(',', ':'))}")


def _save_viz_b64_image(b64_data, filename):
    os.makedirs(TEMP_DIR, exist_ok=True)
    path = os.path.join(TEMP_DIR, filename)
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64_data))
    return path


def _format_todo_list(todo_items):
    if not todo_items:
        return "  (none)"
    lines = []
    for idx, item in enumerate(todo_items, start=1):
        status = "done" if item.get("done") else "open"
        text = (item.get("text") or "").strip() or f"Step {idx}"
        lines.append(f"  {idx}. [{status}] {text}")
    return "\n".join(lines)


def _think_setting(model):
    if "gpt-oss" in model.lower():
        return "medium"
    return True


def _message_thinking(message):
    for attr_name in ("reasoning", "thinking"):
        direct = getattr(message, attr_name, None)
        if isinstance(direct, str) and direct.strip():
            return direct.strip()
    extra = getattr(message, "model_extra", None) or {}
    for key in ("reasoning", "thinking", "reasoning_content"):
        value = extra.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _tool_message(tool_call_id, name, content):
    payload = {
        "role": "tool",
        "tool_name": name,
        "content": content,
    }
    if tool_call_id:
        payload["tool_call_id"] = tool_call_id
    return payload


def _assistant_tool_message(message):
    tool_calls = []
    for tc in message.tool_calls or []:
        tool_calls.append({
            "id": tc.id,
            "type": "function",
            "function": {
                "name": tc.function.name,
                "arguments": tc.function.arguments,
            },
        })
    payload = {
        "role": "assistant",
        "content": message.content or "",
        "tool_calls": tool_calls,
    }
    thinking = _message_thinking(message)
    if thinking:
        payload["thinking"] = thinking
    return payload


def _run_web_search(args, api_key, web_search_url):
    query = str(args.get("query", "")).strip()
    if not query:
        return {"results": [], "error": "Missing query"}
    try:
        max_results = int(args.get("max_results", 5))
    except (TypeError, ValueError):
        max_results = 5
    max_results = max(1, min(10, max_results))

    body = json.dumps({"query": query, "max_results": max_results}).encode("utf-8")
    req = urllib.request.Request(
        web_search_url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    results = data.get("results", [])
    trimmed = []
    for result in results[:max_results]:
        if not isinstance(result, dict):
            continue
        trimmed.append({
            "title": str(result.get("title", ""))[:200],
            "url": str(result.get("url", ""))[:500],
            "content": str(result.get("content", ""))[:1200],
        })
    return {"results": trimmed}


def _handle_web_search(tc, args, api_key, web_search_url):
    """Run a web_search tool call, emit its viz event, return the tool result message."""
    try:
        result = _run_web_search(args, api_key, web_search_url)
    except urllib.error.HTTPError as e:
        result = {"results": [], "error": f"HTTP {e.code}"}
    except Exception as e:
        result = {"results": [], "error": str(e)}
    _emit_viz(
        "web_search_results",
        stage="main",
        query=args.get("query", ""),
        max_results=args.get("max_results", 5),
        results=result.get("results", []),
        error=result.get("error"),
    )
    return _tool_message(tc.id, tc.function.name, json.dumps(result))


def _handle_add_todo(tc, args, todo_items):
    """Append a todo item, return the tool result message."""
    text = str(args.get("text", "")).strip()
    if text:
        todo_items.append({"text": text[:200], "done": False})
    return _tool_message(tc.id, tc.function.name, json.dumps({"status": "ok", "added": text}))


def _handle_complete_todo(tc, args, todo_items):
    """Mark a todo item done by exact-then-substring text match, return the tool result message."""
    text = str(args.get("text", "")).strip()
    match = None
    for item in todo_items:
        if not item.get("done") and item.get("text", "").strip().lower() == text.lower():
            match = item
            break
    if not match:
        for item in todo_items:
            if not item.get("done") and text.lower() in item.get("text", "").lower():
                match = item
                break
    if match:
        match["done"] = True
        return _tool_message(tc.id, tc.function.name, json.dumps({"status": "ok", "completed": match["text"]}))
    open_items = [i.get("text", "") for i in todo_items if not i.get("done")]
    return _tool_message(
        tc.id, tc.function.name,
        json.dumps({"status": "error", "message": f"No open todo item matching '{text}'. Open items: {open_items}"}),
    )


def vlm_step(goal, screenshot_b64, history, system_prompt, todo_items=None, loop_warning=None):
    client, MODEL, api_key, web_search_url = _load_llm_config()
    if todo_items is None:
        todo_items = []
    history_text = (
        "\n".join(f"  Step {i+1}: {h}" for i, h in enumerate(history))
        if history else "  (none)"
    )
    todo_text = _format_todo_list(todo_items or [])
    user_text = (
        f"Goal: {goal}\n\n"
        f"Current todo list:\n{todo_text}\n\n"
        f"Actions taken so far:\n{history_text}\n\n"
        "Here is the current screenshot. Write a short progress update and call tools to make progress."
    )
    if loop_warning:
        user_text += f"\n\nWARNING: {loop_warning}"

    tools = build_tools()
    image_name = f"viz_main_{int(time.time() * 1000)}.jpg"
    image_path = _save_viz_b64_image(screenshot_b64, image_name)
    _emit_viz(
        "prompt_image",
        stage="main",
        path=image_path,
        goal=goal,
        tool_names=[tool["function"]["name"] for tool in tools],
    )

    image_content = {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{screenshot_b64}"}}

    for attempt in range(3):
        try:
            import re as _re
            extra_requirements = ""
            if not (todo_items or []):
                extra_requirements += (
                    "\n\nFIRST-STEP REQUIREMENT: the todo list is empty, so this must be a planning-only step. "
                    "Call add_todo_item for each step in your plan and do NOT call any other tool."
                )
            if attempt > 0:
                extra_requirements += (
                    "\n\nRETRY REQUIREMENT: your previous response was invalid. "
                    "If the todo list is still empty, respond with planning only and add_todo_item calls. "
                    "Otherwise include at least one non-todo tool call."
                )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": [
                    {"type": "text", "text": user_text + extra_requirements},
                    image_content,
                ]},
            ]
            latest_reasoning = ""
            task_done_seen = False

            for tool_round in range(6):
                resp = client.chat.completions.create(
                    model=MODEL,
                    messages=messages,
                    tools=tools,
                    tool_choice="required",
                    parallel_tool_calls=True,
                    max_tokens=1024,
                    temperature=0.1,
                    extra_body={"think": _think_setting(MODEL)},
                )
                message = resp.choices[0].message
                reasoning = _message_thinking(message)
                reasoning = _re.sub(r'(?m)^\s*\w+\(.*\)\s*$', '', reasoning).strip()
                if reasoning:
                    latest_reasoning = reasoning
                    _emit_viz("thinking", stage="main", content=reasoning)
                step_text = (message.content or "").strip()
                step_text = _re.sub(r'(?m)^\s*\w+\(.*\)\s*$', '', step_text).strip()
                if step_text:
                    _emit_viz("text", stage="main", content=step_text)

                tool_calls = []
                has_todo_call = False
                has_non_todo_call = False
                has_task_done = False
                tool_results = []
                todo_snapshot_before = [(i.get("text"), i.get("done")) for i in todo_items]

                for tc in message.tool_calls or []:
                    try:
                        args = json.loads(tc.function.arguments)
                    except Exception:
                        args = tc.function.arguments
                    args_dict = args if isinstance(args, dict) else {}
                    name = tc.function.name

                    tool_calls.append({"name": name, "arguments": args})

                    if name in ("add_todo_item", "complete_todo_item"):
                        has_todo_call = True
                    else:
                        has_non_todo_call = True

                    if name == "web_search":
                        tool_results.append(_handle_web_search(tc, args_dict, api_key, web_search_url))
                    elif name == "add_todo_item":
                        tool_results.append(_handle_add_todo(tc, args_dict, todo_items))
                    elif name == "complete_todo_item":
                        tool_results.append(_handle_complete_todo(tc, args_dict, todo_items))
                    elif name == "task_done":
                        has_task_done = True
                        task_done_seen = True
                        tool_results.append(_tool_message(tc.id, name, json.dumps({"status": "ok"})))

                if tool_calls:
                    _emit_viz("tool_calls", stage="main", tool_calls=tool_calls)

                # Emit todo_state immediately if todos changed in this round
                todo_snapshot_after = [(i.get("text"), i.get("done")) for i in todo_items]
                if todo_snapshot_after != todo_snapshot_before:
                    _emit_viz("todo_state", items=todo_items)

                if has_task_done:
                    break  # exit tool_round loop; task_done_seen triggers return below

                if tool_results:
                    messages.append(_assistant_tool_message(message))
                    messages.extend(tool_results)
                    continue

                if not (todo_items or []):
                    if not has_todo_call:
                        logger.warning(f"[vlm_step] invalid response (attempt {attempt + 1}): missing initial todo list")
                        if attempt == 2:
                            raise RuntimeError("Model failed to create the initial todo list")
                        time.sleep(1)
                        break
                    if has_non_todo_call:
                        logger.warning(f"[vlm_step] invalid response (attempt {attempt + 1}): first step was not planning-only")
                        if attempt == 2:
                            raise RuntimeError("Model used non-todo tools during the initial planning step")
                        time.sleep(1)
                        break
                    return message, latest_reasoning, todo_items

                if not has_non_todo_call:
                    logger.warning(f"[vlm_step] invalid response (attempt {attempt + 1}): no non-todo tool call")
                    if attempt == 2:
                        raise RuntimeError("Model returned a step without a non-todo tool call")
                    time.sleep(1)
                    break

                return message, latest_reasoning, todo_items

            if task_done_seen:
                return message, latest_reasoning, todo_items

            continue
        except Exception as e:
            logger.exception(f"[vlm_step] error (attempt {attempt + 1}): {e}")
            if attempt == 2:
                raise
            time.sleep(3)


def screenshot_to_b64(path):
    from PIL import Image
    jpeg_path = os.path.join(TEMP_DIR, "latest.jpg")
    with Image.open(path) as img:
        img = img.convert("RGB")
        if SCALE_RATIO != 1.0:
            w = max(1, round(img.width * SCALE_RATIO))
            h = max(1, round(img.height * SCALE_RATIO))
            img = img.resize((w, h), Image.LANCZOS)
        img.save(jpeg_path, "JPEG", quality=85)
    with open(jpeg_path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def cleanup_temp():
    for f in os.listdir(TEMP_DIR):
        fp = os.path.join(TEMP_DIR, f)
        if os.path.isfile(fp):
            os.remove(fp)
