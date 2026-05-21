'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ============================================================
// Types
// ============================================================

interface StreamItem {
  id?: number
  type: string
  step?: number
  action?: string
  reasoning?: string
  message?: string
  goal?: string
  tool?: string
  args?: Record<string, unknown>
  result?: string
  data?: string
  text?: string
}

interface SidebarPos {
  x: number
  y: number
  width: number
  height: number
}

// ============================================================
// useStream — SSE connection that pipes frames to an <img> ref
// ============================================================

function useStream(deviceId: string) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [items, setItems] = useState<StreamItem[]>([])
  const [offline, setOffline] = useState(false)
  const [hasFrame, setHasFrame] = useState(false)
  const [fps, setFps] = useState(0)
  const frameCount = useRef(0)
  const lastFpsTime = useRef(Date.now())
  const idCounter = useRef(0)

  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(`/api/relay/${deviceId}/stream`)

      es.onmessage = (e) => {
        let parsed: StreamItem
        try {
          parsed = JSON.parse(e.data)
        } catch {
          return
        }

        if (parsed.type === 'frame') {
          if (imgRef.current && parsed.data) {
            imgRef.current.src = `data:image/jpeg;base64,${parsed.data}`
            setHasFrame(true)
          }
          setOffline(false)
          frameCount.current++
          const now = Date.now()
          if (now - lastFpsTime.current >= 1000) {
            setFps(frameCount.current)
            frameCount.current = 0
            lastFpsTime.current = now
          }
          return
        }

        setItems((prev) => [...prev, { ...parsed, id: idCounter.current++ }])
      }

      es.onerror = () => {
        setOffline(true)
        es?.close()
        reconnectTimer = setTimeout(connect, 2000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [deviceId])

  return { imgRef, items, offline, hasFrame, fps }
}

// ============================================================
// useAgent — send goals / track running state
// ============================================================

function useAgent(deviceId: string) {
  const [running, setRunning] = useState(false)

  const sendGoal = useCallback(async (goal: string, instructions: string) => {
    setRunning(true)
    await fetch(`/api/relay/${deviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, instructions }),
    }).catch(() => {})
  }, [deviceId])

  const markDone = useCallback(() => setRunning(false), [])

  return { running, sendGoal, markDone }
}

// ============================================================
// useManualInput — mouse / keyboard relay
// ============================================================

function useManualInput(deviceId: string, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)

  const send = useCallback(async (action: Record<string, unknown>) => {
    await fetch(`/api/relay/${deviceId}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    }).catch(() => {})
  }, [deviceId])

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    function onMouseMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect()
      send({ type: 'mouse_move', x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
    }

    function onClick(e: MouseEvent) {
      const rect = el!.getBoundingClientRect()
      send({
        type: 'click',
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
        button: e.button === 2 ? 'right' : 'left',
      })
    }

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      send({ type: 'key', key: e.key, modifiers: { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey } })
    }

    function onContextMenu(e: MouseEvent) { e.preventDefault() }

    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('click', onClick)
    el.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('click', onClick)
      el.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled, send])

  return { containerRef }
}

// ============================================================
// ToolBubble
// ============================================================

const TOOL_ICONS: Record<string, string> = {
  click: '🖱️',
  type: '⌨️',
  screenshot: '📷',
  scroll: '↕️',
  key: '⌨️',
  move: '↔️',
  drag: '✋',
}

function ToolBubble({ item }: { item: StreamItem }) {
  const icon = TOOL_ICONS[item.tool ?? ''] ?? '🔧'
  const argsStr = item.args ? JSON.stringify(item.args) : ''
  const short = argsStr.length > 80 ? argsStr.slice(0, 80) + '…' : argsStr

  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-sm shrink-0">{icon}</span>
      <div className="text-xs text-white/60 break-all">
        <span className="text-white/80 font-medium">{item.tool}</span>
        {short && <span className="ml-1 text-white/40">{short}</span>}
      </div>
    </div>
  )
}

// ============================================================
// ChatFeed — groups stream items into collapsible steps
// ============================================================

interface Step {
  n: number
  items: StreamItem[]
}

function groupSteps(items: StreamItem[]): Step[] {
  const steps: Step[] = []
  let current: Step | null = null

  for (const item of items) {
    if (item.type === 'agent:start') {
      current = { n: 0, items: [item] }
      steps.push(current)
    } else if (item.type === 'agent:step') {
      if (!current) { current = { n: 0, items: [] }; steps.push(current) }
      current.n = item.step ?? current.n + 1
      current.items.push(item)
    } else if (item.type === 'agent:done' || item.type === 'agent:error') {
      if (!current) { current = { n: 0, items: [] }; steps.push(current) }
      current.items.push(item)
      current = null
    } else {
      if (!current) { current = { n: 0, items: [] }; steps.push(current) }
      current.items.push(item)
    }
  }

  return steps
}

function FeedItem({ item }: { item: StreamItem }) {
  switch (item.type) {
    case 'agent:start':
      return <div className="text-xs text-white/70 py-1">▶ <span className="text-white/90 font-medium">{item.goal}</span></div>
    case 'agent:step':
      return item.reasoning
        ? <div className="text-xs text-white/40 italic py-0.5">{item.reasoning}</div>
        : null
    case 'agent:tool_call':
      return <ToolBubble item={item} />
    case 'agent:done':
      return <div className="text-xs text-green-400 py-1">✓ {item.message ?? 'Done'}</div>
    case 'agent:error':
      return <div className="text-xs text-red-400 py-1">✗ {item.message ?? 'Error'}</div>
    default:
      return <div className="text-xs text-white/30 py-0.5">{item.message ?? item.text ?? item.type}</div>
  }
}

function StepGroup({ step }: { step: Step }) {
  const [open, setOpen] = useState(true)
  const hasContent = step.items.some(i => i.type !== 'agent:start')

  return (
    <div className="mb-2">
      {step.n > 0 && (
        <button
          onClick={() => setOpen(!open)}
          className="w-full text-left text-xs text-white/40 hover:text-white/70 flex items-center gap-1 py-0.5"
        >
          <span>{open ? '▾' : '▸'}</span>
          <span>Step {step.n}</span>
        </button>
      )}
      {(open || !hasContent) && (
        <div className={step.n > 0 ? 'pl-3 border-l border-white/10' : ''}>
          {step.items.map((item, i) => <FeedItem key={i} item={item} />)}
        </div>
      )}
    </div>
  )
}

function ChatFeed({ items, onDone }: { items: StreamItem[]; onDone?: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  useEffect(() => {
    const last = items[items.length - 1]
    if (last && (last.type === 'agent:done' || last.type === 'agent:error')) {
      onDone?.()
    }
  }, [items, onDone])

  const steps = groupSteps(items)

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-white/20">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
      {steps.map((step, i) => (
        <StepGroup key={i} step={step} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

// ============================================================
// ChatInput — auto-resize textarea
// ============================================================

function ChatInput({
  onSend,
  running,
  disabled,
}: {
  onSend: (goal: string) => void
  running: boolean
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  function autoResize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const t = text.trim()
    if (!t || running || disabled) return
    onSend(t)
    setText('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => { setText(e.target.value); autoResize() }}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Device offline' : 'Give the agent a goal…'}
        disabled={disabled || running}
        rows={1}
        className="flex-1 resize-none rounded-xl bg-white/10 border border-white/20 text-sm text-white placeholder-white/25 px-3 py-2 focus:outline-none focus:border-white/50 disabled:opacity-40 transition"
      />
      <button
        onClick={submit}
        disabled={disabled || running || !text.trim()}
        className="rounded-xl bg-white text-black text-sm font-medium px-3 py-2 shrink-0 hover:bg-white/90 disabled:opacity-30 transition"
      >
        {running ? '…' : 'Send'}
      </button>
    </div>
  )
}

// ============================================================
// SettingsModal
// ============================================================

function SettingsModal({
  instructions,
  onSave,
  onClose,
}: {
  instructions: string
  onSave: (v: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(instructions)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-white/50">Additional instructions (appended to every goal)</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="rounded-xl bg-white/10 border border-white/20 text-sm text-white placeholder-white/30 px-3 py-2 focus:outline-none resize-none focus:border-white/50"
            placeholder="e.g. Always prefer dark mode. Use keyboard shortcuts when possible."
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm text-white/40 hover:text-white px-3 py-1.5">Cancel</button>
          <button
            onClick={() => { onSave(draft); onClose() }}
            className="text-sm bg-white text-black font-medium px-4 py-1.5 rounded-xl hover:bg-white/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// FloatingSidebar — draggable + resizable glassmorphism panel
// ============================================================

const DEFAULT_POS: SidebarPos = { x: 20, y: 56, width: 320, height: 520 }
const STORAGE_KEY = 'guidenco-sidebar-pos'

function loadPos(): SidebarPos {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return JSON.parse(s)
  } catch {}
  return DEFAULT_POS
}

function FloatingSidebar({ children }: { children: React.ReactNode }) {
  const [pos, setPos] = useState<SidebarPos>(DEFAULT_POS)
  const posRef = useRef(pos)
  const dragging = useRef(false)
  const resizing = useRef(false)
  const start = useRef({ mx: 0, my: 0, x: 0, y: 0, width: 0, height: 0 })

  useEffect(() => {
    const p = loadPos()
    setPos(p)
    posRef.current = p
  }, [])

  useEffect(() => {
    posRef.current = pos
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch {}
  }, [pos])

  function onDragDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    start.current = { mx: e.clientX, my: e.clientY, ...posRef.current }
  }

  function onResizeDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = true
    start.current = { mx: e.clientX, my: e.clientY, ...posRef.current }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragging.current) {
        const dx = e.clientX - start.current.mx
        const dy = e.clientY - start.current.my
        setPos(p => ({
          ...p,
          x: Math.max(0, start.current.x + dx),
          y: Math.max(0, start.current.y + dy),
        }))
      }
      if (resizing.current) {
        const dw = e.clientX - start.current.mx
        const dh = e.clientY - start.current.my
        setPos(p => ({
          ...p,
          width: Math.max(240, start.current.width + dw),
          height: Math.max(200, start.current.height + dh),
        }))
      }
    }
    function onUp() { dragging.current = false; resizing.current = false }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div
      style={{ position: 'fixed', left: pos.x, top: pos.y, width: pos.width, height: pos.height, zIndex: 40 }}
      className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
    >
      {/* Glassmorphism bg */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-2xl border border-white/10 rounded-2xl pointer-events-none" />

      {/* Drag handle */}
      <div
        onMouseDown={onDragDown}
        className="relative z-10 flex items-center justify-center h-7 shrink-0 cursor-grab active:cursor-grabbing"
      >
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-hidden flex flex-col px-3 pb-3 min-h-0">
        {children}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeDown}
        className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-20 flex items-end justify-end pr-1.5 pb-1.5"
      >
        <div className="w-3 h-3 border-r-2 border-b-2 border-white/25 rounded-br" />
      </div>
    </div>
  )
}

// ============================================================
// SidebarContent
// ============================================================

function SidebarContent({
  deviceName,
  items,
  running,
  disabled,
  onSend,
  onDone,
  instructions,
  onInstructionsChange,
}: {
  deviceName: string
  items: StreamItem[]
  running: boolean
  disabled: boolean
  onSend: (goal: string) => void
  onDone: () => void
  instructions: string
  onInstructionsChange: (v: string) => void
}) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex flex-col h-full gap-2 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 pt-0.5">
        <span className="text-sm font-semibold text-white truncate">{deviceName}</span>
        <div className="flex items-center gap-2">
          {running && (
            <span className="text-xs text-yellow-400/80 animate-pulse">Running…</span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="text-white/30 hover:text-white/80 transition text-lg leading-none"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Feed */}
      <ChatFeed items={items} onDone={onDone} />

      {/* Input */}
      <div className="shrink-0">
        <ChatInput onSend={onSend} running={running} disabled={disabled} />
      </div>

      {showSettings && (
        <SettingsModal
          instructions={instructions}
          onSave={onInstructionsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ============================================================
// Main DeviceViewer export
// ============================================================

export function DeviceViewer({ deviceId, deviceName }: { deviceId: string; deviceName?: string }) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [instructions, setInstructions] = useState<string>('')

  // Load instructions from localStorage on mount (client only)
  useEffect(() => {
    try {
      setInstructions(localStorage.getItem('guidenco-instructions') ?? '')
    } catch {}
  }, [])

  const { imgRef, items, offline, hasFrame, fps } = useStream(deviceId)
  const { running, sendGoal, markDone } = useAgent(deviceId)
  const { containerRef } = useManualInput(deviceId, mode === 'manual')

  function handleSend(goal: string) {
    sendGoal(goal, instructions)
  }

  function handleInstructionsChange(v: string) {
    setInstructions(v)
    try { localStorage.setItem('guidenco-instructions', v) } catch {}
  }

  const name = deviceName ?? deviceId

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 10 }}>

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-black/70 to-transparent backdrop-blur-sm">
        <Link
          href="/dashboard"
          className="text-white/40 hover:text-white/80 text-sm transition shrink-0"
        >
          ← Devices
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/80 text-sm font-medium truncate">{name}</span>

        <div className="ml-auto flex items-center gap-3">
          {fps > 0 && (
            <span className="text-white/25 text-xs tabular-nums">{fps} fps</span>
          )}
          {offline && (
            <span className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              Offline
            </span>
          )}

          {/* Auto / Manual toggle */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
            <button
              onClick={() => setMode('auto')}
              className={`px-3 py-1.5 transition ${
                mode === 'auto'
                  ? 'bg-white/20 text-white'
                  : 'text-white/35 hover:text-white/65 hover:bg-white/5'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-3 py-1.5 transition ${
                mode === 'manual'
                  ? 'bg-white/20 text-white'
                  : 'text-white/35 hover:text-white/65 hover:bg-white/5'
              }`}
            >
              Manual
            </button>
          </div>
        </div>
      </div>

      {/* ── Video display ── */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ cursor: mode === 'manual' ? 'crosshair' : 'default' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Device screen"
          className="max-w-full max-h-full object-contain"
          style={{ display: hasFrame ? 'block' : 'none' }}
        />
        {!hasFrame && (
          <p className="text-white/20 text-sm select-none">
            {offline ? 'Device offline' : 'Waiting for signal…'}
          </p>
        )}
      </div>

      {/* ── Floating sidebar ── */}
      <FloatingSidebar>
        <SidebarContent
          deviceName={name}
          items={items}
          running={running}
          disabled={offline}
          onSend={handleSend}
          onDone={markDone}
          instructions={instructions}
          onInstructionsChange={handleInstructionsChange}
        />
      </FloatingSidebar>

      {/* ── Manual mode indicator ── */}
      {mode === 'manual' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-black/60 text-white/50 text-xs px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10 pointer-events-none select-none">
          Manual mode — clicks &amp; keystrokes forwarded to device
        </div>
      )}
    </div>
  )
}
