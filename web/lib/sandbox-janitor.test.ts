import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateRun:  vi.fn().mockResolvedValue(undefined),
  terminate:  vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => mocks.selectRows() }) }),
    update: () => ({ set: () => ({ where: () => mocks.updateRun() }) }),
  },
}))

vi.mock('./db/schema', () => ({
  devices: {
    deviceType: 'device_type',
    status:     'status',
    lastSeenAt: 'last_seen_at',
    metadata:   'metadata',
    id:         'id',
  },
}))

vi.mock('./sandbox', () => ({
  terminateSandbox: mocks.terminate,
}))

describe('reapIdleSandboxes', () => {
  beforeEach(() => {
    mocks.selectRows.mockReset()
    mocks.updateRun.mockReset().mockResolvedValue(undefined)
    mocks.terminate.mockReset().mockResolvedValue(undefined)
    vi.resetModules()
  })

  it('terminates sandboxes for offline Remote devices found by the query', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: { sandboxId: 'sbx_1' } },
      { id: 'd2', metadata: { sandboxId: 'sbx_2' } },
    ])
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.terminate).toHaveBeenCalledWith('sbx_1')
    expect(mocks.terminate).toHaveBeenCalledWith('sbx_2')
  })

  it('skips rows whose metadata has no sandboxId', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: null },
      { id: 'd2', metadata: {} },
    ])
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.terminate).not.toHaveBeenCalled()
  })

  it('clears metadata.sandboxId after successful termination', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: { sandboxId: 'sbx_1' } },
    ])
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.updateRun).toHaveBeenCalledTimes(1)
  })

  it('continues if one termination throws (does not stop the batch)', async () => {
    mocks.selectRows.mockResolvedValue([
      { id: 'd1', metadata: { sandboxId: 'sbx_1' } },
      { id: 'd2', metadata: { sandboxId: 'sbx_2' } },
    ])
    mocks.terminate.mockRejectedValueOnce(new Error('boom'))
    const { reapIdleSandboxes } = await import('./sandbox-janitor')
    await reapIdleSandboxes()
    expect(mocks.terminate).toHaveBeenCalledTimes(2)
  })
})
