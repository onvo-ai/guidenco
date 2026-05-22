'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Camera, Loader2, Send, Settings, Square } from 'lucide-react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AgentItem {
  id: number
  type: string           // agent:start | agent:step | agent:done | agent:error
  goal?: string
  step?: number
  action?: string        // action type from agent:step
  detail?: string        // e.g. "(500, 700)" for clicks, '"spacex"' for typing
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

function useStream(deviceId: string, webrtcActiveRef: React.MutableRefObject<boolean>) {
  const imgRef    = useRef<HTMLImageElement>(null)
  const [items, setItems]       = useState<AgentItem[]>([])
  const [currentGoal, setCurrentGoal] = useState('')
  const [todoItems, setTodoItems]     = useState<TodoItem[]>([])
  const [taskStatus, setTaskStatus]   = useState<TaskStatus>(null)
  const [taskResultText, setTaskResultText] = useState<string | null>(null)
  const [running, setRunning]   = useState(false)
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

        // Video frame — SSE fallback only (skip when WebRTC is active)
        if (parsed.type === 'frame') {
          if (!webrtcActiveRef.current) {
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
          }
          return
        }

        const type = parsed.type as string

        if (type === 'agent:start') {
          clearItems()
          setCurrentGoal((parsed.goal as string) ?? '')
          setTaskStatus(null)
          setTaskResultText(null)
          setRunning(true)
          return
        }

        if (type === 'agent:done') {
          setTaskStatus('done')
          setTaskResultText((parsed.message as string) ?? null)
          setRunning(false)
        }

        if (type === 'agent:error') {
          setTaskStatus('failed')
          setTaskResultText((parsed.message as string) ?? null)
          setRunning(false)
        }

        if (type === 'agent:todo') {
          setTodoItems((parsed.items as TodoItem[]) ?? [])
          return // don't add to items list
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

  return { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, running, setRunning, offline, fps, hasFrame, fpsCount, fpsTime, setFps, setHasFrame }
}

// ─────────────────────────────────────────────────────────────────────────────
// useAgent — POST command to start agent loop
// ─────────────────────────────────────────────────────────────────────────────

function useAgent(deviceId: string) {
  const startAgent = useCallback(async (goal: string, instructions: string) => {
    await fetch(`/api/relay/${deviceId}/command`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ goal, instructions }),
    }).catch(() => {})
  }, [deviceId])

  const stopAgent = useCallback(async () => {
    await fetch(`/api/relay/${deviceId}/stop`, { method: 'POST' }).catch(() => {})
  }, [deviceId])

  return { startAgent, stopAgent }
}

// ─────────────────────────────────────────────────────────────────────────────
// useWebRTC — establishes a WebRTC peer connection for low-latency video
// ─────────────────────────────────────────────────────────────────────────────

function useWebRTC(
  deviceId: string,
  fpsCount: React.MutableRefObject<number>,
  fpsTime: React.MutableRefObject<number>,
  setFps: (n: number) => void,
  setHasFrame: (v: boolean) => void,
  webrtcActiveRef: React.MutableRefObject<boolean>,
) {
  const videoRef         = useRef<HTMLVideoElement>(null)
  const [webrtcActive, setWebrtcActive] = useState(false)
  const inputDcRef       = useRef<RTCDataChannel | null>(null)
  const inputMoveDcRef   = useRef<RTCDataChannel | null>(null)

  useEffect(() => {
    let pc: RTCPeerConnection | null = null
    let cancelled = false

    async function start() {
      try {
        // Fetch ephemeral ICE servers (STUN + TURN) before creating the PC.
        // Falls back to STUN-only if the endpoint errors or TURN isn't configured.
        let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
        try {
          const iceRes = await fetch(`/api/relay/${deviceId}/ice-servers`)
          if (iceRes.ok) {
            const iceData = await iceRes.json() as { iceServers: RTCIceServer[] }
            if (Array.isArray(iceData.iceServers) && iceData.iceServers.length > 0) {
              iceServers = iceData.iceServers
            }
          }
        } catch {
          // Non-fatal — STUN-only fallback remains
        }

        pc = new RTCPeerConnection({ iceServers })

        const dcReliable = pc.createDataChannel('input',      { ordered: true })
        const dcFast     = pc.createDataChannel('input-move', { ordered: false, maxRetransmits: 0 })
        inputDcRef.current     = dcReliable
        inputMoveDcRef.current = dcFast
        dcReliable.onopen = () => console.log('[webrtc] input data channel open (reliable)')
        dcFast.onopen     = () => console.log('[webrtc] input-move data channel open (unreliable)')

        pc.ontrack = (event) => {
          console.log('[webrtc] ontrack fired', event.track.kind, 'streams:', event.streams.length, 'track state:', event.track.readyState)
          const video = videoRef.current
          if (!video) { console.warn('[webrtc] videoRef is null'); return }
          const stream = event.streams[0] ?? new MediaStream([event.track])
          console.log('[webrtc] attaching stream, tracks:', stream.getTracks().length)
          if (cancelled) return
          // Force visible BEFORE srcObject — some browsers won't decode frames on display:none elements
          video.style.display = 'block'
          // Only assign srcObject if it's a different stream — avoids interrupting an in-progress play()
          if (video.srcObject !== stream) {
            video.srcObject = stream
          }
          // Don't call play() here — autoPlay attribute handles it.
          // Explicit play() while srcObject is still loading causes AbortError in strict mode.
          webrtcActiveRef.current = true   // synchronous — stops SSE frame processing immediately
          setWebrtcActive(true)
          setHasFrame(true)

          // FPS counting via requestVideoFrameCallback (Chrome/Edge) or rAF fallback
          const videoEl = video
          function tick() {
            if (cancelled || !videoEl.srcObject) return
            fpsCount.current++
            const now = Date.now()
            if (now - fpsTime.current >= 1000) {
              setFps(fpsCount.current)
              fpsCount.current = 0
              fpsTime.current  = now
            }
            if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
              ;(videoEl as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void })
                .requestVideoFrameCallback(tick)
            } else {
              requestAnimationFrame(tick)
            }
          }
          if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            ;(videoEl as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void })
              .requestVideoFrameCallback(tick)
          } else {
            requestAnimationFrame(tick)
          }
        }

        pc.onconnectionstatechange = () => {
          console.log('[webrtc] connectionState ->', pc?.connectionState)
          if (pc?.connectionState === 'connected') {
            // Check RTP stats 3s after connect to confirm video bytes are flowing
            setTimeout(async () => {
              if (!pc) return
              const stats = await pc.getStats()
              stats.forEach((report) => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                  console.log('[webrtc] inbound-rtp video: bytesReceived=', report.bytesReceived, 'framesDecoded=', report.framesDecoded, 'framesDropped=', report.framesDropped)
                }
              })
              const v = videoRef.current
              if (v) console.log('[webrtc] video element: srcObject=', !!v.srcObject, 'videoWidth=', v.videoWidth, 'readyState=', v.readyState, 'paused=', v.paused, 'visibility=', getComputedStyle(v).visibility)
            }, 3000)
          }
          if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
            if (!cancelled) {
              setWebrtcActive(false)
              webrtcActiveRef.current = false
              if (videoRef.current) videoRef.current.srcObject = null
            }
          }
        }

        // Receive-only: we never send video
        pc.addTransceiver('video', { direction: 'recvonly' })

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        // Vanilla ICE: wait until all candidates gathered (max 5s)
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === 'complete') { resolve(); return }
          const onchange = () => {
            if (pc!.iceGatheringState === 'complete') {
              pc!.removeEventListener('icegatheringstatechange', onchange)
              resolve()
            }
          }
          pc!.addEventListener('icegatheringstatechange', onchange)
          setTimeout(() => {
            pc!.removeEventListener('icegatheringstatechange', onchange)
            resolve()
          }, 5000)
        })

        if (cancelled) { pc.close(); return }

        console.log('[webrtc] sending offer, ICE gathering state:', pc.iceGatheringState)
        const res = await fetch(`/api/relay/${deviceId}/webrtc-offer`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sdp: pc.localDescription!.sdp, type: pc.localDescription!.type }),
        })

        if (!res.ok) throw new Error(`Offer rejected: ${res.status}`)

        const answer = await res.json() as { type: RTCSdpType; sdp: string }
        console.log('[webrtc] got answer type:', answer.type)
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        console.log('[webrtc] remote description set, signalingState:', pc.signalingState)
      } catch (err) {
        console.warn('[webrtc] failed, falling back to SSE:', err)
        // SSE frame handling in useStream continues as fallback
      }
    }

    start()

    return () => {
      cancelled = true
      inputDcRef.current     = null
      inputMoveDcRef.current = null
      pc?.close()
      setWebrtcActive(false)
      webrtcActiveRef.current = false
    }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { videoRef, webrtcActive, inputDcRef, inputMoveDcRef }
}

// ─────────────────────────────────────────────────────────────────────────────
// useManualInput — pointer + keyboard relay
// ─────────────────────────────────────────────────────────────────────────────

function useManualInput(
  deviceId: string,
  mode: 'auto' | 'manual',
  shellRef: React.RefObject<HTMLDivElement | null>,
  imgRef: React.RefObject<HTMLImageElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  inputDcRef: React.RefObject<RTCDataChannel | null>,
  inputMoveDcRef: React.RefObject<RTCDataChannel | null>,
) {
  const send = useCallback((action: Record<string, unknown>) => {
    const dc = action.type === 'mouse_move' ? inputMoveDcRef.current : inputDcRef.current
    if (dc?.readyState === 'open') {
      try { dc.send(JSON.stringify(action)); return } catch { /* channel closed mid-send, fall through */ }
    }
    // HTTP fallback — used when WebRTC is not yet established or channel is closing
    fetch(`/api/relay/${deviceId}/input`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(action),
    }).catch(() => {})
  }, [deviceId, inputDcRef, inputMoveDcRef])

  function getViewRect(): { left: number; top: number; width: number; height: number } | null {
    const shell = shellRef.current
    if (!shell) return null
    const r = shell.getBoundingClientRect()

    // Use video dimensions when WebRTC is active, otherwise use img natural dimensions
    const video = videoRef.current
    const img   = imgRef.current
    let nw: number, nh: number
    if (video && video.videoWidth && video.videoHeight) {
      nw = video.videoWidth
      nh = video.videoHeight
    } else if (img && img.naturalWidth && img.naturalHeight) {
      nw = img.naturalWidth
      nh = img.naturalHeight
    } else {
      return null
    }

    const scale = Math.min(r.width / nw, r.height / nh)
    const dw = nw * scale, dh = nh * scale
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
  detail?: string
}

const ACTION_ICONS: Record<string, string> = {
  // Click family — each visually distinct
  left_click:   '🖱️',
  double_click:  '👆',
  right_click:   '📋',
  hover:         '🔍',
  drag:          '✋',
  // Keyboard
  type_text:     '⌨️',
  key:           '🎹',
  // Navigation
  scroll:        '↕️',
  mouse_move:    '↔️',
  // Meta
  wait:          '⏳',
  add_todo_item: '📝',
  complete_todo_item: '✅',
  task_done:     '🏁',
  // Legacy aliases
  click:         '🖱️',
  type:          '⌨️',
  done:          '🏁',
}

const ACTION_NAMES: Record<string, string> = {
  left_click:         'Left Click',
  double_click:       'Double Click',
  right_click:        'Right Click',
  hover:              'Hover',
  drag:               'Drag',
  type_text:          'Type',
  key:                'Key Press',
  scroll:             'Scroll',
  mouse_move:         'Move Mouse',
  wait:               'Wait',
  add_todo_item:      'Plan',
  complete_todo_item: 'Complete',
  task_done:          'Done',
  // Legacy aliases
  click:              'Click',
  type:               'Type',
  done:               'Done',
}

function StepBubble({ step }: { step: Step }) {
  const [thinkOpen, setThinkOpen] = useState(false)
  const icon = ACTION_ICONS[step.action] ?? '🔧'
  const name = ACTION_NAMES[step.action] ?? step.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Reasoning — collapsible (only show if non-empty after trim) */}
        {typeof step.reasoning === 'string' && step.reasoning.trim() && (
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
        {step.action && step.action !== 'task_done' && step.action !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>{name}</span>
            {step.detail && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'ui-monospace,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {step.detail}
              </span>
            )}
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
    .map(i => ({ id: i.id, stepNum: i.step ?? 0, reasoning: typeof i.reasoning === 'string' ? i.reasoning : '', action: i.action ?? '', detail: i.detail }))

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
  videoRef: React.RefObject<HTMLVideoElement | null>
  webrtcActive: boolean
  shellRef: React.RefObject<HTMLDivElement | null>
  mode: 'auto' | 'manual'
  fps: number
  hasFrame: boolean
  offline: boolean
  deviceName: string
  onModeChange: (m: 'auto' | 'manual') => void
  onSnapshot: () => void
  onOpenSettings: () => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

const HEADER_H = 44

function Viewer({ imgRef, videoRef, webrtcActive, shellRef, mode, fps, hasFrame, offline, deviceName, onModeChange, onSnapshot, onOpenSettings, onPointerMove, onPointerDown, onPointerUp, onContextMenu }: ViewerProps) {
  const [showSnapshotTip, setShowSnapshotTip] = useState(false)
  const [showSettingsTip, setShowSettingsTip] = useState(false)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: HEADER_H, zIndex: 50,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Left: back + device name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <Link
            href="/dashboard"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none', flexShrink: 0, padding: '4px 6px', borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Devices</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 14 }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deviceName}
          </span>
          {offline && (
            <span style={{ fontSize: 11, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, padding: '1px 8px', flexShrink: 0 }}>
              Offline
            </span>
          )}
        </div>

        {/* Right: fps + toggle + icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {fps > 0 && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', minWidth: 36, textAlign: 'right' }}>{fps} fps</span>
          )}

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

          {/* Auto / Manual toggle */}
          <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 7, background: 'rgba(255,255,255,0.07)' }}>
            <ToggleBtn active={mode === 'auto'}   onClick={() => onModeChange('auto')}>Auto</ToggleBtn>
            <ToggleBtn active={mode === 'manual'} onClick={() => onModeChange('manual')}>Manual</ToggleBtn>
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

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
        </div>
      </div>

      {/* ── Stream — sits below the header ─────────────────────────────────── */}
      <div
        ref={shellRef}
        style={{ position: 'absolute', top: HEADER_H, left: 0, right: 0, bottom: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      >
        {/* WebRTC video — always in DOM so play() works before React re-renders */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => console.log('[webrtc] video metadata loaded, size:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight)}
          onPlaying={() => console.log('[webrtc] video playing')}
          onStalled={() => console.log('[webrtc] video stalled')}
          onWaiting={() => console.log('[webrtc] video waiting for data')}
          onError={(e) => console.error('[webrtc] video error', e)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', visibility: webrtcActive ? 'visible' : 'hidden', userSelect: 'none', pointerEvents: 'none' }}
        />
        {/* SSE fallback — shown before WebRTC connects */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="display stream"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: webrtcActive ? 'none' : 'block', userSelect: 'none', pointerEvents: 'none' }}
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

  // webrtcActiveRef is a ref (not state) so SSE handler can read it without re-renders
  const webrtcActiveRef = useRef(false)

  const { imgRef, items, currentGoal, todoItems, taskStatus, taskResultText, running, offline, fps, hasFrame, fpsCount, fpsTime, setFps, setHasFrame } = useStream(deviceId, webrtcActiveRef)
  const { videoRef, webrtcActive, inputDcRef, inputMoveDcRef } = useWebRTC(deviceId, fpsCount, fpsTime, setFps, setHasFrame, webrtcActiveRef)
  const { startAgent, stopAgent } = useAgent(deviceId)

  const { onPointerMove, onPointerDown, onPointerUp, onContextMenu } = useManualInput(deviceId, mode, shellRef, imgRef, videoRef, inputDcRef, inputMoveDcRef)

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
  const displayName = deviceName ?? deviceId

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <Viewer
        imgRef={imgRef}
        videoRef={videoRef}
        webrtcActive={webrtcActive}
        shellRef={shellRef}
        mode={mode}
        fps={fps}
        hasFrame={hasFrame}
        offline={offline}
        deviceName={displayName}
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
