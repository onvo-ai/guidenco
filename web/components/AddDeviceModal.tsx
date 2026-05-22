'use client'

import { useState } from 'react'
import { Cpu, Monitor, Cloud, Apple, Box, Computer, Check, Copy } from 'lucide-react'

interface Props {
  onClose: () => void
  onAdded: () => void
}

type DeviceType = 'bridged' | 'self' | 'remote'
type OS = 'macos' | 'linux' | 'windows'

interface TypeOption {
  id: DeviceType
  label: string
  description: string
  icon: React.ReactNode
  available: boolean
}

interface OSOption {
  id: OS
  label: string
  description: string
  icon: React.ReactNode
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

const OS_OPTIONS: OSOption[] = [
  { id: 'macos',   label: 'macOS',   description: 'Apple silicon or Intel Mac running macOS.',         icon: <Apple size={20} /> },
  { id: 'linux',   label: 'Linux',   description: 'Any modern Linux distro with X11.',                 icon: <Box size={20} /> },
  { id: 'windows', label: 'Windows', description: 'Windows 10 or 11 with OpenSSH (built in by default).', icon: <Computer size={20} /> },
]

export function AddDeviceModal({ onClose, onAdded }: Props) {
  const [type, setType] = useState<DeviceType | null>(null)
  const [os, setOs] = useState<OS | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const installCommand =
    typeof window !== 'undefined'
      ? `curl -fsSL ${window.location.origin}/api/install/bridged | GUIDENCO_CLOUD_URL=${window.location.origin} sudo bash`
      : ''

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

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
        // os only stored for Self (device IS the user's machine).
        // For Bridged the device is the Pi (Linux); the chosen `os` is
        // the user's workstation OS — used for instructions only, not stored.
        os: type === 'self' ? os : null,
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

  function goBack() {
    setError('')
    if (os) setOs(null)
    else setType(null)
  }

  const step: 'type' | 'os' | 'details' =
    type === null ? 'type' : os === null ? 'os' : 'details'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === 'type'    && 'Add device'}
            {step === 'os'      && 'Choose your OS'}
            {step === 'details' && 'Pair device'}
          </h2>
          {step !== 'type' && (
            <button
              type="button"
              onClick={goBack}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              ← Back
            </button>
          )}
        </div>

        {step === 'type' && (
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

        {step === 'os' && (
          <div className="space-y-2">
            {OS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setOs(opt.id)}
                className="w-full text-left rounded border border-zinc-700 hover:border-zinc-500 p-3 flex items-start gap-3 transition-colors cursor-pointer"
              >
                <span className="text-zinc-300 mt-0.5">{opt.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-zinc-400 mt-1">{opt.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 'details' && type === 'bridged' && (
          <>
            <p className="text-sm text-zinc-400">
              SSH into your Raspberry Pi, then run this command:
            </p>
            <div className="relative">
              <pre className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2.5 pr-12 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
                {installCommand}
              </pre>
              <button
                type="button"
                onClick={copyInstall}
                aria-label={copied ? 'Copied' : 'Copy install command'}
                className="absolute top-1.5 right-1.5 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              When the script finishes it will print a 6-character pairing code. Enter it below.
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
