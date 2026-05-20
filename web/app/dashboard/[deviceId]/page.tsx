import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { DeviceViewer } from '@/components/DeviceViewer'
import Link from 'next/link'

export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const session = await getSession(await headers())
  if (!session) redirect('/sign-in')

  const { deviceId } = await params

  const [device] = await db
    .select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) redirect('/dashboard')

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Devices
        </Link>
        <span className="text-zinc-700">/</span>
        <h1 className="text-xl font-semibold">{device.name}</h1>
      </div>
      <DeviceViewer deviceId={device.id} />
    </div>
  )
}
