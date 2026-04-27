import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import Viewer from './components/Viewer.jsx';
import ChatFeed from './components/ChatFeed.jsx';
import ChatInput from './components/ChatInput.jsx';
import SettingsModal from './components/SettingsModal.jsx';

import { API_BASE } from './lib/constants.js';
import { useScreenshot } from './hooks/useScreenshot.js';
import { useAgent } from './hooks/useAgent.js';
import { useManualInput } from './hooks/useManualInput.js';
import { useSettings } from './hooks/useSettings.js';

const SIDEBAR_POS_KEY = 'pi-sidebar-pos';
const SIDEBAR_SIZE_KEY = 'pi-sidebar-size';
const SIDEBAR_SECTIONS_KEY = 'pi-sidebar-sections';

function getSaved(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function App() {
  const [mode, setMode] = useState('auto');
  const [input, setInput] = useState('');
  const [items, setItems] = useState([]);
  const [currentGoal, setCurrentGoal] = useState('');
  const [todoItems, setTodoItems] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, updateSettings } = useSettings();
  const shellRef = useRef(null);

  const screenshotBase = `${API_BASE}/display/screenshot`;
  const streamBase = `${API_BASE}/display/stream`;

  const { fps, imgRef } = useScreenshot(streamBase);

  const addItem = useCallback((item) => {
    if (item.kind === 'clear') {
      setItems([]);
      setTodoItems([]);
      return;
    }
    if (item.kind === 'viz' && item.payload?.kind === 'todo_state') {
      setTodoItems(Array.isArray(item.payload.items) ? item.payload.items : []);
      return;
    }
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), ...item }]);
  }, []);

  const { running, startAgent, stopAgent } = useAgent(addItem);

  const { setHoverActive, sendKeyEvent, sendMouseMove, sendMouseDown, sendMouseUp, cancelDrag } =
    useManualInput(mode, imgRef);

  async function handleSend() {
    const goal = input.trim();
    if (!goal) return;
    addItem({ kind: 'clear' });
    setCurrentGoal(goal);
    await startAgent(goal, { additionalInstructions: settings.additionalInstructions });
    setInput('');
  }

  async function snapshot() {
    const res = await fetch(`${screenshotBase}?download=${Date.now()}`, { cache: 'no-store' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snapshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getViewRect() {
    const shell = shellRef.current;
    const img = imgRef.current;
    if (!shell || !img) return null;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (!natW || !natH) return null;
    const shellRect = shell.getBoundingClientRect();
    const scale = Math.min(shellRect.width / natW, shellRect.height / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;
    return {
      left: shellRect.left + (shellRect.width - drawW) / 2,
      top: shellRect.top + (shellRect.height - drawH) / 2,
      width: drawW,
      height: drawH,
    };
  }

  useEffect(() => {
    const handler = (e) => sendKeyEvent(e);
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [sendKeyEvent]);

  const isManual = mode === 'manual';
  const completed = todoItems.filter((item) => item?.done).length;
  const stepCount = items.filter(i => i.kind === 'viz' && i.payload?.kind === 'prompt_image').length;
  const lastResult = [...items].reverse().find(i => i.kind === 'viz' && i.payload?.kind === 'task_result');
  const taskStatus = lastResult ? (lastResult.payload.success ? 'done' : 'failed') : null;
  const taskResultText = lastResult?.payload?.result || null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <Viewer
        imgRef={imgRef}
        shellRef={shellRef}
        mode={mode}
        running={running}
        onModeChange={setMode}
        onSnapshot={snapshot}
        onOpenSettings={() => setSettingsOpen(true)}
        onPointerEnter={() => setHoverActive(true)}
        onPointerLeave={() => setHoverActive(false)}
        onPointerMove={(e) => sendMouseMove(e, getViewRect)}
        onPointerDown={(e) => sendMouseDown(e, getViewRect)}
        onPointerUp={(e) => sendMouseUp(e, getViewRect)}
        onPointerCancel={cancelDrag}
        onContextMenu={(e) => e.preventDefault()}
      />

      {!isManual && (
        <FloatingSidebar>
          <SidebarContent
            currentGoal={currentGoal}
            todoItems={todoItems}
            completed={completed}
            stepCount={stepCount}
            taskStatus={taskStatus}
            taskResultText={taskResultText}
            items={items}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            onStop={stopAgent}
            running={running}
          />
        </FloatingSidebar>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
      />
    </div>
  );
}

// ── Floating sidebar shell ────────────────────────────────────────────────────

function FloatingSidebar({ children }) {
  const initPos = getSaved(SIDEBAR_POS_KEY, null);
  const initSize = getSaved(SIDEBAR_SIZE_KEY, { w: 320, h: null });

  const [pos, setPos] = useState(initPos);
  const [size, setSize] = useState(initSize);
  const sidebarRef = useRef(null);

  // On mount: set default position if none saved, and clamp any out-of-bounds saved position
  useEffect(() => {
    const w = size.w || 320;
    const h = size.h || 400;
    if (!pos) {
      const p = { x: window.innerWidth - w - 20, y: 20 };
      setPos(p);
      localStorage.setItem(SIDEBAR_POS_KEY, JSON.stringify(p));
    } else {
      const clamped = {
        x: Math.max(10, Math.min(window.innerWidth - w - 10, pos.x)),
        y: Math.max(10, Math.min(window.innerHeight - h - 10, pos.y)),
      };
      if (clamped.x !== pos.x || clamped.y !== pos.y) {
        setPos(clamped);
        localStorage.setItem(SIDEBAR_POS_KEY, JSON.stringify(clamped));
      }
    }
  }, []);

  function savePos(p) { setPos(p); localStorage.setItem(SIDEBAR_POS_KEY, JSON.stringify(p)); }
  function saveSize(s) { setSize(s); localStorage.setItem(SIDEBAR_SIZE_KEY, JSON.stringify(s)); }

  function onDragMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = sidebarRef.current;
    const startX = e.clientX - (pos?.x ?? 0);
    const startY = e.clientY - (pos?.y ?? 0);
    function onMove(e) {
      const w = el ? el.offsetWidth : (size.w || 320);
      const h = el ? el.offsetHeight : (size.h || 400);
      const x = Math.max(10, Math.min(window.innerWidth - w - 10, e.clientX - startX));
      const y = Math.max(10, Math.min(window.innerHeight - h - 10, e.clientY - startY));
      savePos({ x, y });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onResizeMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = sidebarRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = el ? el.offsetWidth : (size.w || 320);
    const startH = el ? el.offsetHeight : (size.h || 500);
    function onMove(e) {
      saveSize({
        w: Math.min(window.innerWidth - 20, Math.max(260, startW + (e.clientX - startX))),
        h: Math.min(window.innerHeight - 20, Math.max(240, startH + (e.clientY - startY))),
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  if (!pos) return null;

  return (
    <div
      ref={sidebarRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w || 320,
        ...(size.h ? { height: size.h } : { maxHeight: 'calc(100vh - 40px)' }),
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10, 10, 16, 0.55)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        userSelect: 'none',
      }}
    >
      {/* Drag handle strip */}
      <div
        onMouseDown={onDragMouseDown}
        style={{
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, userSelect: 'text' }}>
        {children}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 18,
          height: 18,
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: 4,
        }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 7L7 1M4 7L7 4M7 7L7 7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ currentGoal, todoItems, completed, stepCount, taskStatus, taskResultText, items, input, setInput, onSend, onStop, running }) {
  const initSections = getSaved(SIDEBAR_SECTIONS_KEY, { todo: true, steps: true });
  const [todoOpen, setTodoOpen] = useState(initSections.todo ?? true);
  const [stepsOpen, setStepsOpen] = useState(initSections.steps ?? true);

  function toggleTodo() { const n = !todoOpen; setTodoOpen(n); saveSections(n, stepsOpen); }
  function toggleSteps() { const n = !stepsOpen; setStepsOpen(n); saveSections(todoOpen, n); }
  function saveSections(t, s) { localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify({ todo: t, steps: s })); }

  const allDone = todoItems.length > 0 && completed === todoItems.length;

  return (
    <>
      {/* Scrollable sections area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Goal */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={labelStyle}>Goal</div>
              <div style={goalTextStyle}>{currentGoal || 'No active goal.'}</div>
            </div>
            {currentGoal && (
              taskStatus === 'done' ? (
                <div style={statusBadge('#4ade80', 'rgba(74,222,128,0.2)')}>✓</div>
              ) : taskStatus === 'failed' ? (
                <div style={statusBadge('#f87171', 'rgba(248,113,113,0.2)')}>✗</div>
              ) : running ? (
                <div style={statusBadge('rgba(255,255,255,0.35)', 'rgba(255,255,255,0.07)')}>
                  <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : null
            )}
          </div>
          {taskResultText && taskStatus && (
            <div style={{
              marginTop: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: taskStatus === 'done' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${taskStatus === 'done' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
              fontSize: 12,
              lineHeight: 1.5,
              color: taskStatus === 'done' ? '#86efac' : '#fca5a5',
            }}>
              {taskResultText}
            </div>
          )}
        </div>

        {/* Todo */}
        <div style={sectionStyle}>
          <button onClick={toggleTodo} style={collapsibleHeaderStyle}>
            <span style={labelStyle}>Todo</span>
            <span style={{ ...countStyle, ...(allDone ? { color: '#4ade80' } : {}) }}>
              {todoItems.length ? `${completed} / ${todoItems.length}` : '0 items'}
            </span>
            <span style={chevronStyle}>{todoOpen ? '▾' : '▸'}</span>
          </button>
          {todoOpen && (
            <div style={{ marginTop: 6 }}>
              {todoItems.length === 0 ? (
                <div style={emptyStyle}>The agent has not created a plan yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {todoItems.map((item, i) => (
                    <label key={`${i}-${item.text}`} style={todoRowStyle}>
                      <input type="checkbox" checked={!!item.done} readOnly
                        style={{ marginTop: 2, flexShrink: 0, accentColor: '#3b82f6', cursor: 'default', pointerEvents: 'none' }} />
                      <span style={item.done ? todoDoneStyle : todoTextStyle}>{item.text}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Steps */}
        <div style={{ ...sectionStyle, flexShrink: 0 }}>
          <button onClick={toggleSteps} style={collapsibleHeaderStyle}>
            <span style={labelStyle}>Steps</span>
            <span style={{
              ...countStyle,
              ...(taskStatus === 'done' ? { color: '#4ade80' } : taskStatus === 'failed' ? { color: '#f87171' } : {}),
            }}>
              {stepCount > 0 ? `${stepCount} steps` : '0 steps'}
            </span>
            <span style={chevronStyle}>{stepsOpen ? '▾' : '▸'}</span>
          </button>
        </div>

        {stepsOpen ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatFeed items={items} />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }} />
        )}
      </div>

      {/* Input — always pinned to bottom */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={onSend}
        onStop={onStop}
        disabled={false}
        running={running}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function statusBadge(color, bg) {
  return {
    width: 20, height: 20, borderRadius: '50%',
    background: bg,
    border: `1px solid ${color}`,
    color,
    fontSize: 10, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };
}

const sectionStyle = {
  padding: '10px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
};

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.35)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const goalTextStyle = {
  marginTop: 4,
  color: 'rgba(255,255,255,0.85)',
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const collapsibleHeaderStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

const countStyle = {
  marginLeft: 'auto',
  fontSize: 11,
  color: 'rgba(255,255,255,0.3)',
};

const chevronStyle = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.3)',
};

const emptyStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.25)',
  lineHeight: 1.4,
};

const todoRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  cursor: 'default',
};

const todoTextStyle = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.8)',
  lineHeight: 1.4,
};

const todoDoneStyle = {
  ...todoTextStyle,
  color: 'rgba(255,255,255,0.28)',
  textDecoration: 'line-through',
};
