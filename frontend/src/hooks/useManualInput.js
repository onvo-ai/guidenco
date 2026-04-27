import { useRef, useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../lib/constants';

export function useManualInput(mode, imgRef) {
  const hoverActiveRef = useRef(false);
  const hoverSinceRef = useRef(0);
  const lastMouseSendRef = useRef(0);
  const dragStartRef = useRef(null);
  const [cursorPos, setCursorPos] = useState(null);

  const setHoverActive = (v) => {
    hoverActiveRef.current = v;
    if (v) hoverSinceRef.current = Date.now();
  };

  const base = `${API_BASE}`;

  // Release any HID button the VLM agent may have left held when entering manual mode
  useEffect(() => {
    if (mode === 'manual') {
      // no-op: mouse/up endpoint removed
    } else {
      dragStartRef.current = null;
    }
  }, [mode, base]);

  const sendKeyEvent = useCallback((event) => {
    if (mode !== 'manual') return;
    if (event.target && ['TEXTAREA', 'INPUT'].includes(event.target.tagName)) return;
    const special = {
      Escape: 'escape', Enter: 'return', Tab: 'tab', Backspace: 'backspace', Delete: 'delete',
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ' ': 'space',
    };
    if (event.repeat) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      fetch(`${base}/keyboard/type?text=${encodeURIComponent(event.key)}`);
      return;
    }
    const parts = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('win');
    const base2 = special[event.key] || event.key.toLowerCase();
    parts.push(base2);
    event.preventDefault();
      fetch(`${base}/keyboard/key?k=${encodeURIComponent(parts.join('+'))}`);
  }, [mode, base]);

  const sendMouseMove = useCallback((event, getViewRect) => {
    if (mode !== 'manual') return;
    if (!hoverActiveRef.current && !dragStartRef.current) return;
    const now = Date.now();
    if (now - lastMouseSendRef.current < 40) return;
    const rect = getViewRect();
    if (!rect) return;
    const coord = pointerToCoord(event, rect);
    if (!coord) return;
    lastMouseSendRef.current = now;
    setCursorPos({ rx: (coord.x - 1) / 999, ry: (coord.y - 1) / 999 });
    fetch(`${base}/mouse/move?x=${coord.x}&y=${coord.y}`);
  }, [mode, base]);

  const sendMouseDown = useCallback((event, getViewRect) => {
    if (mode !== 'manual') return;
    const rect = getViewRect();
    if (!rect) return;
    const coord = pointerToCoord(event, rect);
    if (!coord) return;
    event.preventDefault();
    if (event.button === 2) {
      fetch(`${base}/mouse/click?b=right&x=${coord.x}&y=${coord.y}`);
      return;
    }
    dragStartRef.current = { x: coord.x, y: coord.y };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }, [mode, base]);

  const sendMouseUp = useCallback((event, getViewRect) => {
    if (mode !== 'manual') return;
    const start = dragStartRef.current;
    if (!start) return;
    dragStartRef.current = null;
    try { event.currentTarget?.releasePointerCapture?.(event.pointerId); } catch {}
    const rect = getViewRect();
    if (!rect) return;
    const coord = pointerToCoord(event, rect);
    event.preventDefault();
    if (coord) {
      const dx = Math.abs(coord.x - start.x);
      const dy = Math.abs(coord.y - start.y);
      if (dx > 5 || dy > 5) {
        fetch(`${base}/mouse/drag?x1=${start.x}&y1=${start.y}&x2=${coord.x}&y2=${coord.y}`);
      } else {
        fetch(`${base}/mouse/click?b=left&x=${start.x}&y=${start.y}`);
      }
    } else {
      fetch(`${base}/mouse/click?b=left&x=${start.x}&y=${start.y}`);
    }
  }, [mode, base]);

  const cancelDrag = useCallback(() => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
  }, [base]);

  return { setHoverActive, sendKeyEvent, sendMouseMove, sendMouseDown, sendMouseUp, cancelDrag, cursorPos };
}

function pointerToCoord(event, rect) {
  if (!rect) return null;
  if (event.clientX < rect.left || event.clientX > rect.left + rect.width) return null;
  if (event.clientY < rect.top || event.clientY > rect.top + rect.height) return null;
  const rx = (event.clientX - rect.left) / rect.width;
  const ry = (event.clientY - rect.top) / rect.height;
  return {
    x: Math.max(1, Math.min(1000, Math.round(rx * 1000))),
    y: Math.max(1, Math.min(1000, Math.round(ry * 1000))),
  };
}