/**
 * sandbox-janitor.ts — periodically terminates e2b sandboxes for Remote
 * devices that have been offline > IDLE_MS. The device row stays around so
 * the user can re-provision (future work) or delete it; we just kill the
 * compute and clear metadata.sandboxId.
 */
import { db } from './db/client'
import { devices } from './db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { terminateSandbox } from './sandbox'

const IDLE_MS    = 60 * 60 * 1000      // 1 hour
const INTERVAL_MS = 5 * 60 * 1000      // 5 minutes

let _timer: ReturnType<typeof setInterval> | null = null

/** Find offline Remote devices, terminate their sandboxes, clear metadata. */
export async function reapIdleSandboxes(): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_MS)

  const rows = await db
    .select({ id: devices.id, metadata: devices.metadata })
    .from(devices)
    .where(
      and(
        eq(devices.deviceType, 'remote'),
        eq(devices.status, 'offline'),
        sql`(${devices.lastSeenAt} IS NULL OR ${devices.lastSeenAt} < ${cutoff})`,
      ),
    )

  for (const row of rows) {
    const sandboxId = (row.metadata as { sandboxId?: string } | null)?.sandboxId
    if (!sandboxId) continue

    try {
      await terminateSandbox(sandboxId)
    } catch (err) {
      console.warn(`[sandbox-janitor] terminate(${sandboxId}) failed:`, err instanceof Error ? err.message : err)
      // Fall through — still clear metadata so we don't keep retrying forever.
    }

    await db
      .update(devices)
      .set({ metadata: null })
      .where(eq(devices.id, row.id))
  }
}

/** Schedule reapIdleSandboxes() on a 5-minute interval. Idempotent. */
export function startSandboxJanitor(): void {
  if (_timer) return
  _timer = setInterval(() => {
    reapIdleSandboxes().catch((err) =>
      console.error('[sandbox-janitor] tick failed:', err instanceof Error ? err.message : err),
    )
  }, INTERVAL_MS)
  _timer.unref?.()
  console.log(`[sandbox-janitor] started (interval=${INTERVAL_MS / 1000}s, idle threshold=${IDLE_MS / 1000}s)`)
}
