'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onAdded: () => void
}

export function AddDeviceModal({ onClose, onAdded }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/devices/claim-redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to add device')
      setLoading(false)
      return
    }

    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">Add Device</h2>
        <p className="text-sm text-zinc-400">
          Run the install script on your Raspberry Pi, then enter the code it prints.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Device name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Pi"
              required
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Pairing code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC-123"
              required
              maxLength={7}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-zinc-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-zinc-700 py-2 text-sm hover:border-zinc-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded bg-zinc-100 text-zinc-900 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
            >
              {loading ? 'Linking…' : 'Link Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
