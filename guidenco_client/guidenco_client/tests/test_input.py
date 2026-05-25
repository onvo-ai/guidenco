"""Tests for the pynput input backend. pynput is mocked so we don't actually
move the cursor during tests."""
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mocked_pynput():
    """Patch pynput so PynputInput uses MagicMocks for mouse/keyboard."""
    with patch("guidenco_client.input.pynput_backend.MouseController") as MC, \
         patch("guidenco_client.input.pynput_backend.KeyboardController") as KC:
        mouse = MagicMock()
        kb = MagicMock()
        MC.return_value = mouse
        KC.return_value = kb
        from guidenco_client.input.pynput_backend import PynputInput
        sink = PynputInput(screen_width=1000, screen_height=500)
        yield sink, mouse, kb


def test_mouse_move_scales_fraction_to_pixels(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    assert sink.execute({"type": "mouse_move", "x": 0.5, "y": 0.2}) == "ok"
    assert mouse.position == (500, 100)


def test_left_click_positions_and_clicks(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    assert sink.execute({"type": "click", "x": 0.25, "y": 0.5, "button": "left"}) == "ok"
    assert mouse.position == (250, 250)
    assert mouse.click.called
    args, _ = mouse.click.call_args
    assert args[0].name == "left"


def test_right_click_uses_right_button(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    sink.execute({"type": "right_click", "x": 0.1, "y": 0.1})
    args, _ = mouse.click.call_args
    assert args[0].name == "right"


def test_double_click_calls_click_with_count_2(mocked_pynput):
    sink, mouse, _ = mocked_pynput
    sink.execute({"type": "double_click", "x": 0.5, "y": 0.5})
    args, _ = mouse.click.call_args
    assert args[1] == 2 or (len(args) >= 2 and args[1] == 2)


def test_type_text_passes_string_to_keyboard(mocked_pynput):
    sink, _, kb = mocked_pynput
    sink.execute({"type": "type_text", "text": "hello world"})
    kb.type.assert_called_once_with("hello world")


def test_unknown_action_returns_error_string(mocked_pynput):
    sink, _, _ = mocked_pynput
    result = sink.execute({"type": "fly_to_moon"})
    assert "unknown action" in result.lower()
