'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

export function DeviceCard({ device }: { device: Device }) {
  // Cache-bust the thumbnail every time the card mounts. If the device is
  // online, also refresh periodically so the preview updates.
  const [cacheBust, setCacheBust] = useState(() => Date.now())
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (device.status !== 'online') return
    const id = setInterval(() => setCacheBust(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [device.status])

  const thumbUrl = `/api/relay/${device.id}/thumbnail?t=${cacheBust}`

  return (
    <Link
      href={`/dashboard/${device.id}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden hover:border-zinc-600 transition-colors"
    >
      <div className="relative bg-black aspect-video w-full overflow-hidden">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`${device.name} preview`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs">
            No preview yet
          </div>
        )}
        <span
          className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${
            device.status === 'online'
              ? 'bg-green-900/80 text-green-400 backdrop-blur'
              : 'bg-zinc-800/80 text-zinc-400 backdrop-blur'
          }`}
        >
          {device.status}
        </span>
      </div>
      <div className="p-3">
        <div className="font-medium text-sm">{device.name}</div>
        {device.lastSeenAt && (
          <p className="text-xs text-zinc-600 mt-0.5">
            Last seen {new Date(device.lastSeenAt).toLocaleString()}
          </p>
        )}
      </div>
    </Link>
  )
}
