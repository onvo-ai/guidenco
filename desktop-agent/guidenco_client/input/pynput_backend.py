"""Cross-platform input injection using pynput."""
import logging
import time

from pynput.keyboard import Controller as KeyboardController
from pynput.keyboard import Key
from pynput.mouse import Button
from pynput.mouse import Controller as MouseController

logger = logging.getLogger("guidenco_client.input")


KEY_MAP: dict[str, Key] = {
    "Enter": Key.enter,
    "Return": Key.enter,
    "Tab": Key.tab,
    "Escape": Key.esc,
    "Backspace": Key.backspace,
    "Delete": Key.delete,
    " ": Key.space,
    "ArrowUp": Key.up,
    "ArrowDown": Key.down,
    "ArrowLeft": Key.left,
    "ArrowRight": Key.right,
    "Home": Key.home,
    "End": Key.end,
    "PageUp": Key.page_up,
    "PageDown": Key.page_down,
    "Shift": Key.shift,
    "Control": Key.ctrl,
    "Alt": Key.alt,
    "Meta": Key.cmd,
}


class PynputInput:
    """Executes action dicts on the host OS via pynput. Coordinates in actions
    are fractional (0–1); scaled to actual screen dimensions in __init__."""

    def __init__(self, screen_width: int, screen_height: int) -> None:
        self._mouse = MouseController()
        self._kb = KeyboardController()
        self._w = screen_width
        self._h = screen_height

    def _xy(self, action: dict, x_key: str = "x", y_key: str = "y") -> tuple[int, int]:
        return int(action[x_key] * self._w), int(action[y_key] * self._h)

    def _press_modifiers(self, mods: dict) -> list[Key]:
        pressed: list[Key] = []
        for name, key in (("shift", Key.shift), ("ctrl", Key.ctrl), ("alt", Key.alt), ("meta", Key.cmd)):
            if mods.get(name):
                self._kb.press(key)
                pressed.append(key)
        return pressed

    def _release_modifiers(self, pressed: list[Key]) -> None:
        for key in reversed(pressed):
            self._kb.release(key)

    def execute(self, action: dict) -> str:
        action_type = action.get("type")
        try:
            if action_type == "mouse_move":
                self._mouse.position = self._xy(action)

            elif action_type == "click":
                self._mouse.position = self._xy(action)
                button = Button.right if action.get("button") == "right" else Button.left
                self._mouse.click(button)

            elif action_type == "right_click":
                self._mouse.position = self._xy(action)
                self._mouse.click(Button.right)

            elif action_type == "double_click":
                self._mouse.position = self._xy(action)
                self._mouse.click(Button.left, 2)

            elif action_type == "scroll":
                if "x" in action and "y" in action:
                    self._mouse.position = self._xy(action)
                dy = action.get("dy", 0)
                self._mouse.scroll(0, -dy // 120 if dy else 0)

            elif action_type == "drag":
                sx, sy = self._xy(action, "start_x", "start_y")
                ex, ey = self._xy(action, "end_x", "end_y")
                self._mouse.position = (sx, sy)
                self._mouse.press(Button.left)
                time.sleep(0.05)
                self._mouse.position = (ex, ey)
                time.sleep(0.05)
                self._mouse.release(Button.left)

            elif action_type == "key":
                key_str = action["key"]
                key = KEY_MAP.get(key_str)
                if key is None and len(key_str) == 1:
                    key = key_str
                if key is None:
                    return f"unknown key: {key_str}"
                pressed = self._press_modifiers(action.get("modifiers", {}))
                self._kb.press(key)
                self._kb.release(key)
                self._release_modifiers(pressed)

            elif action_type == "type_text":
                self._kb.type(action["text"])

            else:
                return f"unknown action type: {action_type}"

            return "ok"

        except Exception as exc:
            logger.exception("action failed")
            return f"error: {exc}"
