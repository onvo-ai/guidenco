'use client'

import { useState } from 'react'
import { Cpu, Monitor, Cloud } from 'lucide-react'

interface Props {
  onClose: () => void
  onAdded: () => void
}

type DeviceType = 'bridged' | 'self' | 'remote'

interface TypeOption {
  id: DeviceType
  label: string
  description: string
  icon: React.ReactNode
  available: boolean
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    id: 'bridged',
    label: 'Bridged',
    description: 'Control another computer via a Raspberry Pi (HDMI + USB-HID).',
    icon: <Cpu size={20} />,
    available: true,
  },
  {
    id: 'self',
    label: 'Self',
    description: 'Control this computer directly with a small background client.',
    icon: <Monitor size={20} />,
    available: false,
  },
  {
    id: 'remote',
    label: 'Remote',
    description: 'Spin up a cloud Linux desktop sandbox managed by Guidenco.',
    icon: <Cloud size={20} />,
    available: false,
  },
]

export function AddDeviceModal({ onClose, onAdded }: Props) {
  const [type, setType] = useState<DeviceType | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!type) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/devices/claim-redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        deviceType: type,
      }),
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {type ? 'Pair device' : 'Add device'}
          </h2>
          {type && (
            <button
              type="button"
              onClick={() => { setType(null); setError('') }}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              ← Change type
            </button>
          )}
        </div>

        {type === null && (
          <div className="space-y-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={!opt.available}
                onClick={() => opt.available && setType(opt.id)}
                className={`w-full text-left rounded border p-3 flex items-start gap-3 transition-colors ${
                  opt.available
                    ? 'border-zinc-700 hover:border-zinc-500 cursor-pointer'
                    : 'border-zinc-800 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="text-zinc-300 mt-0.5">{opt.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {!opt.available && (
                      <span className="text-[10px] uppercase tracking-wide bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-zinc-400 mt-1">{opt.description}</span>
                </span>
              </button>
            ))}
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded border border-zinc-700 py-2 text-sm hover:border-zinc-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {type === 'bridged' && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
