import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the exported logic of waitForWebRTCAnswer by accessing the
// module's exported function directly.  The Map state is module-level
// so we re-import the module fresh per describe block using vi.resetModules().
describe('waitForWebRTCAnswer', () => {
  beforeEach(() => { vi.resetModules() })

  it('resolves with the SDP when _resolveWebRTCAnswer is called with matching deviceId', async () => {
    const { waitForWebRTCAnswer, _resolveWebRTCAnswer } = await import('./relay')
    const promise = waitForWebRTCAnswer('dev-1')
    _resolveWebRTCAnswer('dev-1', 'v=0\r\no=- ...')
    const sdp = await promise
    expect(sdp).toBe('v=0\r\no=- ...')
  })

  it('rejects if no answer arrives within timeout', async () => {
    vi.useFakeTimers()
    const { waitForWebRTCAnswer } = await import('./relay')
    const promise = waitForWebRTCAnswer('dev-timeout')
    vi.advanceTimersByTime(16000)
    await expect(promise).rejects.toThrow('timeout')
    vi.useRealTimers()
  })
})
