'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeviceCard } from '@/components/DeviceCard'
import { AddDeviceModal } from '@/components/AddDeviceModal'
import { authClient } from '@/lib/auth-client'

interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function fetchDevices() {
    try {
      const res = await fetch('/api/devices', { credentials: 'include' })
      console.log('[dashboard] /api/devices status:', res.status)
      if (res.status === 401) {
        setFetchError('Session expired (401). Please sign in again.')
        setLoading(false)
        return
      }
      const data = await res.json()
      setDevices(data)
      setLoading(false)
    } catch (err) {
      console.error('[dashboard] fetchDevices error:', err)
      setFetchError(String(err))
      setLoading(false)
    }
  }

  useEffect(() => { fetchDevices() }, [])

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/sign-in')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Devices</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="rounded bg-zinc-100 text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            + Add Device
          </button>
          <button
            onClick={handleSignOut}
            className="rounded border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Sign out
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : fetchError ? (
        <p className="text-red-400 text-sm">{fetchError}</p>
      ) : devices.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg mb-2">No devices yet</p>
          <p className="text-sm">Add your first Raspberry Pi to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
        </div>
      )}

      {showModal && (
        <AddDeviceModal
          onClose={() => setShowModal(false)}
          onAdded={fetchDevices}
        />
      )}
    </div>
  )
}
