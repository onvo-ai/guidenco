import Link from 'next/link'

interface Device {
  id: string
  name: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

export function DeviceCard({ device }: { device: Device }) {
  return (
    <Link
      href={`/dashboard/${device.id}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{device.name}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            device.status === 'online'
              ? 'bg-green-900/50 text-green-400'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {device.status}
        </span>
      </div>
      {device.lastSeenAt && (
        <p className="text-xs text-zinc-600">
          Last seen {new Date(device.lastSeenAt).toLocaleString()}
        </p>
      )}
    </Link>
  )
}
