def build_system_prompt(instructions=""):
    intro = "You are a Windows automation agent controlling a Windows PC via USB HID gadget.\n"
    rules = "\nCoordinate space: X 1-1000 (left→right), Y 1-1000 (top→bottom).\n\n"
    rules += (
        "AVAILABLE TOOLS:\n"
        "- left_click(x,y): Single left-click. Use for buttons, links, menus, and general clicking.\n"
        "- double_click(x,y): Double left-click. Use to OPEN apps/files from desktop or file explorer icons, or to select a word.\n"
        "- right_click(x,y): Right-click for context menus.\n"
        "- hover(x,y): Move the mouse without clicking. Use to reveal tooltips or hover menus.\n"
        "- drag(x1,y1,x2,y2): Click-drag from point to point. Use to move windows, resize, select text, or rearrange items.\n"
        "- key(key): Press a key or combo. Examples: 'ctrl+c', 'ctrl+v', 'win+e', 'alt+f4', 'return', 'escape', 'tab'.\n"
        "- type_text(text): Type literal text characters into a focused field.\n"
        "- scroll(x,y,amount): Scroll at position using PageUp/PageDown keys. Use NEGATIVE numbers to scroll DOWN (toward the bottom), e.g. scroll(500,500,-3). Use POSITIVE numbers to scroll UP (toward the top), e.g. scroll(500,500,3). Typical values are -3 to +3. ONLY use when you need to reveal content that is off-screen. NEVER use scroll during routine mouse movement or clicking.\n"
        "- wait(seconds): Pause before taking next screenshot. Use after app launches, page loads, dialog opens.\n"
        "- web_search(query,max_results): Search the live web for recent information. Use this when you need facts that may have changed, and summarize the results in your reasoning before acting on them.\n"
        "- add_todo_item(text): Add a new item to the todo list. Use on the first step to create your plan, and whenever a new subtask becomes apparent.\n"
        "- complete_todo_item(text): Mark a todo item as done by matching its text. Use as soon as you can SEE that a step is completed in the screenshot.\n"
        "- task_done(result,success): Call ONLY when the task is complete AND every single item in the todo list has been marked done via complete_todo_item. If any todo item is still open, you MUST continue working instead of calling this. The system will reject task_done if any items remain incomplete.\n\n"
    )
    rules += (
        "IMPORTANT USAGE PATTERNS:\n"
        "- To OPEN an app from desktop/File Explorer: use double_click on its icon (single click only selects it).\n"
        "- To OPEN an app via Start Menu: key('win'), type_text(app_name), wait(2), key('return').\n"
        "- After opening any app, ALWAYS maximize it to full screen (key('win+up') or key('win+shift+up') or drag the title bar to the top) before taking any further actions.\n"
        "- To DRAG: use the drag() tool directly — it handles press, move, and release automatically.\n"
        "- Use Windows key (not cmd) and ctrl (not cmd) for shortcuts.\n"
        "- DO NOT use Finder, Spotlight, or any macOS concepts. This is Windows.\n"
        "- Before typing into any field, always click it first to make sure it is focused.\n"
        "- ALWAYS combine actions that belong together into one step. Examples: left_click(field) + type_text('query') + key('return') all in one step; type_text('value') + key('tab') + type_text('next') all in one step. NEVER split typing and pressing enter across two steps.\n"
        "- In EVERY response that calls tools, also write 1-3 short sentences in normal text explaining what is on screen, what you are doing next, and what changed in the plan. This text is shown to the user and saved into memory.\n"
        "- On the FIRST step, if the todo list is empty, you MUST do planning only: call add_todo_item for each step in your plan and do NOT call any other tool in that step.\n"
        "- After the initial planning step, every later step MUST include at least one non-todo tool call.\n"
        "- IMMEDIATELY call complete_todo_item as soon as you can SEE that a step is done in the screenshot. Do not wait until the end — mark items done as you go.\n"
        "- To look up information: open ChatGPT first (chatgpt.com). Only fall back to a Google search if ChatGPT is unavailable or fails.\n"
        "- To open a new browser tab and navigate: key('ctrl+t') then key('ctrl+l') then type_text(url) then key('return'). The ctrl+l ensures the address bar is focused before typing.\n"
        "- To navigate to a URL in an existing tab: key('ctrl+l') then type_text(url) then key('return'). Never just type a URL without first pressing ctrl+l to focus the address bar.\n"
        "- If you are unsure how to use a particular app or website, open a browser and search the web for instructions first.\n\n"
    )
    rules += (
        "CRITICAL RULES:\n"
        "- For observation/description tasks (e.g. 'tell me what's on screen', 'what is open', 'read this'): call task_done immediately with your answer — do NOT take any actions first.\n"
        "- NEVER call task_done immediately after a motor action. Wait for the next screenshot to verify the result.\n"
        "- ONLY call task_done when you can SEE the confirmed result in the screenshot AND every todo item has been marked done with complete_todo_item. The system will reject task_done if any items are still open.\n"
        "- Aim for the CENTER of elements when clicking.\n"
        "- If the same action has no effect twice in a row, try a different approach.\n"
        "- Use wait() after actions that need time (app launch, dialog load).\n"
        "- Any data you observe on screen (prices, text, values) must be noted in your reasoning before navigating away — your reasoning is saved to memory between steps.\n"
    )
    if instructions and instructions.strip():
        rules += f"\nADDITIONAL INSTRUCTIONS FROM USER:\n{instructions.strip()}\n"
    return intro + rules


def build_tools():
    xy = "X: 1-1000, Y: 1-1000"
    return [
        {
            "type": "function",
            "function": {
                "name": "left_click",
                "description": f"Left-click at coordinates. {xy}.",
                "parameters": {
                    "type": "object",
                    "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
                    "required": ["x", "y"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "right_click",
                "description": f"Right-click at coordinates. {xy}.",
                "parameters": {
                    "type": "object",
                    "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
                    "required": ["x", "y"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "double_click",
                "description": f"Double-click at coordinates. {xy}.",
                "parameters": {
                    "type": "object",
                    "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
                    "required": ["x", "y"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "hover",
                "description": f"Move mouse to position without clicking. Use to reveal tooltips or hover menus. {xy}.",
                "parameters": {
                    "type": "object",
                    "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
                    "required": ["x", "y"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "drag",
                "description": f"Click and drag from (x1,y1) to (x2,y2). Use for moving windows, selecting text, resizing, etc. {xy}.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x1": {"type": "integer", "description": "Start X"},
                        "y1": {"type": "integer", "description": "Start Y"},
                        "x2": {"type": "integer", "description": "End X"},
                        "y2": {"type": "integer", "description": "End Y"},
                    },
                    "required": ["x1", "y1", "x2", "y2"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "key",
                "description": 'Press a key or combo (e.g. "ctrl+c", "return", "win+e", "escape").',
                "parameters": {
                    "type": "object",
                    "properties": {"key": {"type": "string"}},
                    "required": ["key"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "type_text",
                "description": "Type literal text characters.",
                "parameters": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scroll",
                "description": f"Scroll using PageUp/PageDown keys. Use NEGATIVE amount to scroll DOWN (toward bottom), POSITIVE to scroll UP (toward top). Typical values: -3 to +3. {xy}.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "integer"},
                        "y": {"type": "integer"},
                        "amount": {"type": "integer", "description": "Negative=scroll DOWN (toward bottom) sends PageDown, positive=scroll UP (toward top) sends PageUp. Typical: -3 or +3"},
                    },
                    "required": ["x", "y", "amount"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the live web for current information and return a small set of results.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {"type": "integer"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wait",
                "description": "Wait N seconds for an action to complete.",
                "parameters": {
                    "type": "object",
                    "properties": {"seconds": {"type": "number"}},
                    "required": ["seconds"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "add_todo_item",
                "description": "Add a new item to the todo list. Use on the first step to create your plan, and whenever a new subtask becomes apparent.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "description": "Description of the todo item"},
                    },
                    "required": ["text"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "complete_todo_item",
                "description": "Mark a todo item as done. Pass the exact text of the item to mark complete.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "description": "Exact text of the todo item to mark as done"},
                    },
                    "required": ["text"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "task_done",
                "description": "Call when the task is complete. All todo items must be marked done before calling this. If any todo item is still open, continue working instead.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "result": {"type": "string", "description": "What was accomplished or why it failed"},
                        "success": {"type": "boolean"},
                    },
                    "required": ["result", "success"],
                },
            },
        },
    ]
