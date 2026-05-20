'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  deviceId: string
}

interface AgentEvent {
  type: string
  step?: number
  action?: string
  reasoning?: string
  message?: string
  goal?: string
}

function eventLabel(ev: AgentEvent): string {
  switch (ev.type) {
    case 'agent:start':   return `▶ Starting: ${ev.goal}`
    case 'agent:step':    return `Step ${ev.step}: ${ev.action} — ${ev.reasoning}`
    case 'agent:done':    return `✓ Done: ${ev.message}`
    case 'agent:error':   return `✗ Error: ${ev.message}`
    default:              return JSON.stringify(ev)
  }
}

export function DeviceViewer({ deviceId }: Props) {
  const [imgSrc, setImgSrc]     = useState<string | null>(null)
  const [events, setEvents]     = useState<AgentEvent[]>([])
  const [goal, setGoal]         = useState('')
  const [sending, setSending]   = useState(false)
  const [offline, setOffline]   = useState(false)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const es = new EventSource(`/api/relay/${deviceId}/stream`)

    es.onmessage = (e) => {
      let parsed: AgentEvent
      try {
        parsed = JSON.parse(e.data)
      } catch {
        return
      }

      if (parsed.type === 'frame') {
        // Pi video frame — update screenshot
        setImgSrc(`data:image/jpeg;base64,${(parsed as unknown as { data: string }).data}`)
        setOffline(false)
        return
      }

      // All other events (agent:start, agent:step, agent:done, agent:error) go to the log
      setEvents((prev) => [...prev.slice(-99), parsed])
    }

    es.onerror = () => setOffline(true)

    return () => es.close()
  }, [deviceId])

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  async function sendGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim()) return
    setSending(true)
    await fetch(`/api/relay/${deviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goal.trim() }),
    })
    setGoal('')
    setSending(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Video frame */}
      <div className="relative bg-zinc-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
        {imgSrc ? (
          <img src={imgSrc} alt="Device screen" className="w-full h-full object-contain" />
        ) : (
          <p className="text-zinc-600 text-sm">{offline ? 'Device offline' : 'Waiting for signal…'}</p>
        )}
        {offline && (
          <div className="absolute top-2 right-2 bg-red-900/70 text-red-300 text-xs px-2 py-1 rounded">
            Offline
          </div>
        )}
      </div>

      {/* Agent event log */}
      <div className="bg-zinc-900 rounded-lg p-3 overflow-y-auto max-h-48 text-xs font-mono space-y-1">
        {events.length === 0
          ? <p className="text-zinc-600">No events yet…</p>
          : events.map((ev, i) => (
            <div
              key={i}
              className={
                ev.type === 'agent:error'   ? 'text-red-400' :
                ev.type === 'agent:done'    ? 'text-green-400' :
                ev.type === 'agent:start'   ? 'text-zinc-300' :
                'text-zinc-400'
              }
            >
              {eventLabel(ev)}
            </div>
          ))
        }
        <div ref={eventsEndRef} />
      </div>

      {/* Goal input */}
      <form onSubmit={sendGoal} className="flex gap-2">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Enter a goal for the agent…"
          disabled={offline}
          className="flex-1 rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={sending || offline || !goal.trim()}
          className="rounded bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-40"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
