import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { DeviceViewer } from '@/components/DeviceViewer'

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

  return <DeviceViewer deviceId={device.id} deviceName={device.name} />
}
