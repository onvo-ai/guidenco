import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const sandbox = {
    sandboxId: 'sbx_test_abc',
    commands:  { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }) },
    kill:      vi.fn().mockResolvedValue(undefined),
    setTimeout: vi.fn().mockResolvedValue(undefined),
  }
  const Sandbox = {
    create: vi.fn().mockResolvedValue(sandbox),
    kill:   vi.fn().mockResolvedValue(undefined),
  }
  return { sandbox, Sandbox }
})

vi.mock('e2b', () => ({ Sandbox: mocks.Sandbox }))

describe('sandbox', () => {
  beforeEach(() => {
    process.env.E2B_API_KEY = 'e2b_test_key'
    delete process.env.E2B_TEMPLATE
    mocks.Sandbox.create.mockClear()
    mocks.Sandbox.kill.mockClear()
    mocks.sandbox.commands.run.mockClear()
    vi.resetModules()
  })

  describe('createSandbox', () => {
    it('uses the default desktop template when E2B_TEMPLATE is unset', async () => {
      const { createSandbox } = await import('./sandbox')
      await createSandbox('dev-1', 'tok-1', 'http://example.local')
      expect(mocks.Sandbox.create).toHaveBeenCalledWith('desktop', expect.objectContaining({ apiKey: 'e2b_test_key' }))
    })

    it('uses E2B_TEMPLATE when set', async () => {
      process.env.E2B_TEMPLATE = 'guidenco-custom'
      const { createSandbox } = await import('./sandbox')
      await createSandbox('dev-1', 'tok-1', 'http://example.local')
      expect(mocks.Sandbox.create).toHaveBeenCalledWith('guidenco-custom', expect.any(Object))
    })

    it('writes the device.json config and starts guidenco-client in the sandbox', async () => {
      const { createSandbox } = await import('./sandbox')
      await createSandbox('dev-1', 'tok-1', 'http://example.local')
      const calls = mocks.sandbox.commands.run.mock.calls.map(c => c[0])
      const allScripts = calls.join('\n')
      expect(allScripts).toContain('dev-1')
      expect(allScripts).toContain('tok-1')
      expect(allScripts).toContain('http://example.local')
      expect(allScripts).toContain('/api/install/self/package.tar.gz')
      expect(allScripts).toContain('guidenco-client')
    })

    it('returns the sandbox id', async () => {
      const { createSandbox } = await import('./sandbox')
      const id = await createSandbox('dev-1', 'tok-1', 'http://example.local')
      expect(id).toBe('sbx_test_abc')
    })

    it('throws a clear error if E2B_API_KEY is missing', async () => {
      delete process.env.E2B_API_KEY
      const { createSandbox } = await import('./sandbox')
      await expect(createSandbox('dev-1', 'tok-1', 'http://example.local')).rejects.toThrow(/E2B_API_KEY/)
    })
  })

  describe('terminateSandbox', () => {
    it('calls Sandbox.kill with the sandbox id and api key', async () => {
      const { terminateSandbox } = await import('./sandbox')
      await terminateSandbox('sbx_existing_123')
      expect(mocks.Sandbox.kill).toHaveBeenCalledWith('sbx_existing_123', expect.objectContaining({ apiKey: 'e2b_test_key' }))
    })

    it('does not throw if kill fails (idempotent — sandbox may already be gone)', async () => {
      mocks.Sandbox.kill.mockRejectedValueOnce(new Error('NotFound'))
      const { terminateSandbox } = await import('./sandbox')
      await expect(terminateSandbox('sbx_gone')).resolves.toBeUndefined()
    })
  })
})
