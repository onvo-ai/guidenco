'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Camera, Loader2, Send, Settings, Square } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AgentItem {
  id: number
  type: string           // agent:start | agent:step | agent:done | agent:error
  goal?: string
  step?: number
  action?: string        // action type from agent:step
  reasoning?: string
  message?: string
}

interface TodoItem {
  text: string
  done: boolean
}

type TaskStatus = 'done' | 'failed' | null

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSaved<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const POS_KEY      = 'guidenco-sidebar-pos'
const SIZE_KEY     = 'guidenco-sidebar-size'
const SECTIONS_KEY = 'guidenco-sidebar-sections'
const INSTR_KEY    = 'guidenco-instructions'

// ─────────────────────────────────────────────────────────────────────────────
// useStream — SSE, pipes frames directly to an <img> ref
// ─────────────────────────────────────────────────────────────────────────────

function useStream(deviceId: string) {
  const imgRef    = useRef<HTMLImageElement>(null)
  const [items, setItems]       = useState<AgentItem[]>([])
  const [currentGoal, setCurrentGoal] = useState('')
  const [todoItems, setTodoItems]     = useState<TodoItem[]>([])
  const [taskStatus, setTaskStatus]   = useState<TaskStatus>(null)
  const [taskResultText, setTaskResultText] = useState<string | null>(null)
  const [offline, setOffline]   = useState(false)
  const [fps, setFps]           = useState(0)
  const [hasFrame, setHasFrame] = useState(false)
  const idRef    = useRef(0)
  const fpsCount = useRef(0)
  const fpsTime  = useRef(Date.now())

  const clearItems = useCallback(() => {
    setItems([])
    setTodoItems([])
    setTaskStatus(null)
    setTaskResultText(null)
  }, [])

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(`/api/relay/${deviceId}/stream`)

      es.onmessage = (e) => {
        let parsed: Record<string, unknown>
        try { parsed = JSON.parse(e.data as string) } catch { return }

        // Video frame — update img directly, no React re-render
        if (parsed.type === 'frame') {
          if (imgRef.current && parsed.data) {
            imgRef.current.src = `data:image/jpeg;base64,${parsed.data as string}`
            setHasFrame(true)
          }
          setOffline(false)
          fpsCount.current++
          const now = Date.now()
          if (now - fpsTime.current >= 1000) {
            setFps(fpsCount.current)
            fpsCount.current = 0
            fpsTime.current  = now
          }
          return
        }

        const type = parsed.type as string

        if (type === 'agent:start') {
          clearItems()
          setCurrentGoal((parsed.goal as string) ?? '')
          setTaskStatus(null)
          setTaskResultText(null)
          return
        }

        if (type === 'agent:done') {
          setTaskStatus('done')
          setTaskResultText((parsed.message as string) ?? null)
        }

        if (type === 'agent:error') {
          setTaskStatus('failed')
          setTaskResultText((parsed.message as string) ?? null)
        }

        setItems(prev => [...prev, { id: idRef.current++, type, ...parsed } as AgentItem])
      }

      es.onerror = () => {
        setOffline(true)
        es?.close()
        retryTimer = setTimeout(connect, 2000)
      }
    }

    connect()
    return () => { clearTimeout(retryTimer); es?.close() }
  }, [deviceId, clearItems])

  return { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, offline, fps, hasFrame }
}

// ─────────────────────────────────────────────────────────────────────────────
// useAgent — POST command to start agent loop
// ─────────────────────────────────────────────────────────────────────────────

function useAgent(deviceId: string) {
  const [running, setRunning] = useState(false)

  const startAgent = useCallback(async (goal: string, instructions: string) => {
    setRunning(true)
    await fetch(`/api/relay/${deviceId}/command`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ goal, instructions }),
    }).catch(() => {})
  }, [deviceId])

  const stopAgent = useCallback(() => setRunning(false), [])

  return { running, startAgent, stopAgent }
}

// ─────────────────────────────────────────────────────────────────────────────
// useManualInput — pointer + keyboard relay
// ─────────────────────────────────────────────────────────────────────────────

function useManualInput(deviceId: string, mode: 'auto' | 'manual', shellRef: React.RefObject<HTMLDivElement | null>, imgRef: React.RefObject<HTMLImageElement | null>) {
  const send = useCallback(async (action: Record<string, unknown>) => {
    await fetch(`/api/relay/${deviceId}/input`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(action),
    }).catch(() => {})
  }, [deviceId])

  // Compute the letterboxed image rect inside the shell div
  function getViewRect(): { left: number; top: number; width: number; height: number } | null {
    const shell = shellRef.current
    const img   = imgRef.current
    if (!shell || !img) return null
    const nw = img.naturalWidth, nh = img.naturalHeight
    if (!nw || !nh) return null
    const r     = shell.getBoundingClientRect()
    const scale = Math.min(r.width / nw, r.height / nh)
    const dw    = nw * scale, dh = nh * scale
    return { left: r.left + (r.width - dw) / 2, top: r.top + (r.height - dh) / 2, width: dw, height: dh }
  }

  useEffect(() => {
    if (mode !== 'manual') return

    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      e.preventDefault()
      send({ type: 'key', key: e.key, modifiers: { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey } })
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mode, send])

  function onPointerMove(e: React.PointerEvent) {
    if (mode !== 'manual') return
    const rect = getViewRect()
    if (!rect) return
    send({ type: 'mouse_move', x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
  }

  function onPointerDown(e: React.PointerEvent) {
    if (mode !== 'manual') return
    const rect = getViewRect()
    if (!rect) return
    send({ type: 'click', x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, button: e.button === 2 ? 'right' : 'left' })
  }

  function onPointerUp(_e: React.PointerEvent) { /* for drag support later */ }
  function onContextMenu(e: React.MouseEvent) { if (mode === 'manual') e.preventDefault() }

  return { onPointerMove, onPointerDown, onPointerUp, onContextMenu }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatInput
// ─────────────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  input: string
  setInput: (v: string) => void
  onSend: () => void
  onStop: () => void
  disabled: boolean
  running: boolean
}

function ChatInput({ input, setInput, onSend, onStop, disabled, running }: ChatInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(60, el.scrollHeight)}px`
  }, [input])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  const canSend = !disabled && input.trim().length > 0

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px 0 0', gap: 8 }}>
        <textarea
          ref={taRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent to do something…"
          disabled={disabled}
          style={{
            flex: 1,
            minHeight: 60,
            padding: '14px 14px',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.88)',
            font: 'inherit',
            fontSize: 13,
            resize: 'none',
            overflow: 'hidden',
            outline: 'none',
            lineHeight: 1.45,
            boxSizing: 'border-box',
          }}
        />
        {running ? (
          <button
            onClick={onStop}
            type="button"
            title="Stop agent"
            style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,80,80,0.4)', background: 'rgba(255,60,60,0.18)', color: 'rgba(255,120,120,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            type="button"
            title="Send"
            style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: canSend ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)', color: canSend ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSend ? 'pointer' : 'not-allowed' }}
          >
            <Send size={13} />
          </button>
        )}
      </div>
      <style>{`textarea::placeholder{color:rgba(255,255,255,0.22)!important}`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StepBubble — one agent step
// ─────────────────────────────────────────────────────────────────────────────

interface Step {
  id: number
  stepNum: number
  reasoning: string
  action: string
}

const ACTION_ICONS: Record<string, string> = {
  click: '🖱️', double_click: '🖱️', right_click: '🖱️',
  type: '⌨️', key: '⌨️',
  scroll: '↕️', mouse_move: '↔️', drag: '✋',
  wait: '⏳', done: '✓',
}

function StepBubble({ step }: { step: Step }) {
  const [thinkOpen, setThinkOpen] = useState(false)
  const icon = ACTION_ICONS[step.action] ?? '🔧'

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Reasoning — collapsible */}
        {step.reasoning && (
          <div>
            <button
              onClick={() => setThinkOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '3px 0', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            >
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{thinkOpen ? '▾' : '▸'}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thinking</span>
              {!thinkOpen && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
                  {step.reasoning.slice(0, 80)}
                </span>
              )}
            </button>
            {thinkOpen && (
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                {step.reasoning}
              </div>
            )}
          </div>
        )}

        {/* Action */}
        {step.action && step.action !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'ui-monospace,monospace' }}>{step.action}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatFeed
// ─────────────────────────────────────────────────────────────────────────────

function ChatFeed({ items }: { items: AgentItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  const steps: Step[] = items
    .filter(i => i.type === 'agent:step')
    .map(i => ({ id: i.id, stepNum: i.step ?? 0, reasoning: i.reasoning ?? '', action: i.action ?? '' }))

  if (steps.length === 0) {
    return (
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.18)', fontSize: 12, padding: '12px 16px' }}>
          Start a chat to see agent reasoning here.
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      {steps.map(s => <StepBubble key={s.id} step={s} />)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SidebarContent — Goal / Todo / Steps / Feed / Input
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarContentProps {
  currentGoal: string
  todoItems: TodoItem[]
  items: AgentItem[]
  taskStatus: TaskStatus
  taskResultText: string | null
  running: boolean
  input: string
  setInput: (v: string) => void
  onSend: () => void
  onStop: () => void
}

function SidebarContent({ currentGoal, todoItems, items, taskStatus, taskResultText, running, input, setInput, onSend, onStop }: SidebarContentProps) {
  const initSections = getSaved<{ todo: boolean; steps: boolean }>(SECTIONS_KEY, { todo: true, steps: true })
  const [todoOpen,  setTodoOpen]  = useState(initSections.todo)
  const [stepsOpen, setStepsOpen] = useState(initSections.steps)

  function toggleTodo()  { const n = !todoOpen;  setTodoOpen(n);  save(SECTIONS_KEY, { todo: n, steps: stepsOpen }) }
  function toggleSteps() { const n = !stepsOpen; setStepsOpen(n); save(SECTIONS_KEY, { todo: todoOpen, steps: n }) }

  const completed = todoItems.filter(i => i?.done).length
  const allDone   = todoItems.length > 0 && completed === todoItems.length
  const stepCount = items.filter(i => i.type === 'agent:step').length

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* ── Goal ─────────────────────────────────────────────────────────── */}
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
              marginTop: 8, padding: '8px 10px', borderRadius: 8,
              background: taskStatus === 'done' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${taskStatus === 'done' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
              fontSize: 12, lineHeight: 1.5,
              color: taskStatus === 'done' ? '#86efac' : '#fca5a5',
            }}>
              {taskResultText}
            </div>
          )}
        </div>

        {/* ── Todo ─────────────────────────────────────────────────────────── */}
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
                    <label key={i} style={todoRowStyle}>
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

        {/* ── Steps header ─────────────────────────────────────────────────── */}
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

        {/* ── Steps feed ───────────────────────────────────────────────────── */}
        {stepsOpen ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatFeed items={items} />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }} />
        )}
      </div>

      {/* ── Input — pinned to bottom ──────────────────────────────────────── */}
      <ChatInput input={input} setInput={setInput} onSend={onSend} onStop={onStop} disabled={false} running={running} />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FloatingSidebar
// ─────────────────────────────────────────────────────────────────────────────

function FloatingSidebar({ children }: { children: React.ReactNode }) {
  const initSize = getSaved<{ w: number; h: number | null }>(SIZE_KEY, { w: 320, h: null })
  const [pos,  setPos]  = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState(initSize)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = getSaved<{ x: number; y: number } | null>(POS_KEY, null)
    const w = size.w || 320
    const h = size.h || 400
    if (!saved) {
      const p = { x: window.innerWidth - w - 20, y: 20 }
      setPos(p); save(POS_KEY, p)
    } else {
      const clamped = {
        x: Math.max(10, Math.min(window.innerWidth  - w - 10, saved.x)),
        y: Math.max(10, Math.min(window.innerHeight - h - 10, saved.y)),
      }
      setPos(clamped); save(POS_KEY, clamped)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function savePos(p: { x: number; y: number }) { setPos(p); save(POS_KEY, p) }
  function saveSize(s: { w: number; h: number | null }) { setSize(s); save(SIZE_KEY, s) }

  function onDragMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX - (pos?.x ?? 0)
    const startY = e.clientY - (pos?.y ?? 0)
    const el = sidebarRef.current
    function onMove(e: MouseEvent) {
      const w = el ? el.offsetWidth  : (size.w || 320)
      const h = el ? el.offsetHeight : (size.h || 400)
      savePos({
        x: Math.max(10, Math.min(window.innerWidth  - w - 10, e.clientX - startX)),
        y: Math.max(10, Math.min(window.innerHeight - h - 10, e.clientY - startY)),
      })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const el = sidebarRef.current
    const startX = e.clientX, startY = e.clientY
    const startW = el ? el.offsetWidth  : (size.w || 320)
    const startH = el ? el.offsetHeight : (size.h || 500)
    function onMove(e: MouseEvent) {
      saveSize({
        w: Math.min(window.innerWidth  - 20, Math.max(260, startW + (e.clientX - startX))),
        h: Math.min(window.innerHeight - 20, Math.max(240, startH + (e.clientY - startY))),
      })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!pos) return null

  return (
    <div
      ref={sidebarRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top:  pos.y,
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
      {/* Drag handle */}
      <div
        onMouseDown={onDragMouseDown}
        style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, userSelect: 'text' }}>
        {children}
      </div>

      {/* Resize grip */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{ position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, cursor: 'nwse-resize', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 4 }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 7L7 1M4 7L7 4M7 7L7 7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsModal
// ─────────────────────────────────────────────────────────────────────────────

function SettingsModal({ open, instructions, onSave, onClose }: { open: boolean; instructions: string; onSave: (v: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(instructions)
  useEffect(() => { if (open) setDraft(instructions) }, [open, instructions])
  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div style={{ width: '90%', maxWidth: 420, borderRadius: 14, background: 'rgb(18,18,26)', border: '1px solid rgba(255,255,255,0.1)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Additional instructions</label>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={5}
            placeholder="e.g. Always prefer dark mode. Use keyboard shortcuts."
            style={{ borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', fontSize: 13, padding: '10px 12px', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.45 }}
          />
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: 0 }}>Appended to every goal you send.</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px' }}>Cancel</button>
          <button onClick={() => { onSave(draft); onClose() }} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer', padding: '6px 16px' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Viewer — top controls + full-screen stream
// ─────────────────────────────────────────────────────────────────────────────

interface ViewerProps {
  imgRef: React.RefObject<HTMLImageElement | null>
  shellRef: React.RefObject<HTMLDivElement | null>
  mode: 'auto' | 'manual'
  fps: number
  hasFrame: boolean
  offline: boolean
  onModeChange: (m: 'auto' | 'manual') => void
  onSnapshot: () => void
  onOpenSettings: () => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

function Viewer({ imgRef, shellRef, mode, fps, hasFrame, offline, onModeChange, onSnapshot, onOpenSettings, onPointerMove, onPointerDown, onPointerUp, onContextMenu }: ViewerProps) {
  const [showSnapshotTip, setShowSnapshotTip] = useState(false)
  const [showSettingsTip, setShowSettingsTip] = useState(false)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Stream */}
      <div
        ref={shellRef}
        style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="display stream"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
          draggable={false}
        />
        {!hasFrame && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
              {offline ? 'Device offline' : 'Waiting for signal…'}
            </span>
          </div>
        )}
      </div>

      {/* Centered top controls pill */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50, display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', borderRadius: 10,
        background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        whiteSpace: 'nowrap',
      }}>
        {/* Auto / Manual toggle */}
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 7, background: 'rgba(255,255,255,0.07)' }}>
          <ToggleBtn active={mode === 'auto'}   onClick={() => onModeChange('auto')}>Auto</ToggleBtn>
          <ToggleBtn active={mode === 'manual'} onClick={() => onModeChange('manual')}>Manual</ToggleBtn>
        </div>

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

        {fps > 0 && (
          <>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', minWidth: 40, textAlign: 'center' }}>{fps} fps</span>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
          </>
        )}

        {/* Snapshot */}
        <div style={{ position: 'relative' }} onMouseEnter={() => setShowSnapshotTip(true)} onMouseLeave={() => setShowSnapshotTip(false)}>
          <IconBtn onClick={onSnapshot}><Camera size={14} /></IconBtn>
          {showSnapshotTip && <Tooltip>Snapshot</Tooltip>}
        </div>

        {/* Settings */}
        <div style={{ position: 'relative' }} onMouseEnter={() => setShowSettingsTip(true)} onMouseLeave={() => setShowSettingsTip(false)}>
          <IconBtn onClick={onOpenSettings}><Settings size={14} /></IconBtn>
          {showSettingsTip && <Tooltip>Settings</Tooltip>}
        </div>

        {offline && (
          <>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
            <span style={{ fontSize: 11, color: '#f87171' }}>Offline</span>
          </>
        )}
      </div>
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '4px 10px', borderRadius: 5, border: 'none',
      background: active ? 'rgba(59,130,246,0.75)' : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,0.5)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} type="button" style={{ padding: '4px 6px', borderRadius: 6, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
      {children}
    </button>
  )
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.82)', color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function statusBadge(color: string, bg: string): React.CSSProperties {
  return { width: 20, height: 20, borderRadius: '50%', background: bg, border: `1px solid ${color}`, color, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
}

const sectionStyle: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }
const labelStyle: React.CSSProperties   = { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }
const goalTextStyle: React.CSSProperties = { marginTop: 4, color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
const collapsibleHeaderStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }
const countStyle: React.CSSProperties  = { marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)' }
const chevronStyle: React.CSSProperties = { fontSize: 10, color: 'rgba(255,255,255,0.3)' }
const emptyStyle: React.CSSProperties  = { fontSize: 12, color: 'rgba(255,255,255,0.25)', lineHeight: 1.4 }
const todoRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'default' }
const todoTextStyle: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }
const todoDoneStyle: React.CSSProperties = { ...todoTextStyle, color: 'rgba(255,255,255,0.28)', textDecoration: 'line-through' }

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function DeviceViewer({ deviceId, deviceName }: { deviceId: string; deviceName?: string }) {
  const [mode,        setMode]        = useState<'auto' | 'manual'>('auto')
  const [input,       setInput]       = useState('')
  const [instructions, setInstructions] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)

  // Load instructions from localStorage (client-only)
  useEffect(() => { setInstructions(getSaved<string>(INSTR_KEY, '')) }, [])

  const { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, offline, fps, hasFrame } = useStream(deviceId)
  const { running, startAgent, stopAgent } = useAgent(deviceId)

  // Mark done when agent finishes
  useEffect(() => {
    const last = items[items.length - 1]
    if (last && (last.type === 'agent:done' || last.type === 'agent:error')) {
      stopAgent()
    }
  }, [items, stopAgent])

  const { onPointerMove, onPointerDown, onPointerUp, onContextMenu } = useManualInput(deviceId, mode, shellRef, imgRef)

  async function handleSend() {
    const goal = input.trim()
    if (!goal) return
    setInput('')
    await startAgent(goal, instructions)
  }

  async function snapshot() {
    const img = imgRef.current
    if (!img?.src) return
    const a = document.createElement('a')
    a.href = img.src
    a.download = `snapshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`
    a.click()
  }

  function handleInstructionsSave(v: string) {
    setInstructions(v)
    save(INSTR_KEY, v)
  }

  const isManual = mode === 'manual'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <Viewer
        imgRef={imgRef}
        shellRef={shellRef}
        mode={mode}
        fps={fps}
        hasFrame={hasFrame}
        offline={offline}
        onModeChange={setMode}
        onSnapshot={snapshot}
        onOpenSettings={() => setSettingsOpen(true)}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      />

      {!isManual && (
        <FloatingSidebar>
          <SidebarContent
            currentGoal={currentGoal}
            todoItems={todoItems}
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

      {isManual && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '6px 14px', borderRadius: 20, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', pointerEvents: 'none', userSelect: 'none' }}>
          Manual mode — clicks &amp; keystrokes forwarded to device
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        instructions={instructions}
        onSave={handleInstructionsSave}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
