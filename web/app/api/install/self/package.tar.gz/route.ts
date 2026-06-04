import { spawn } from 'child_process'
import { join } from 'path'

// Streams a fresh tar.gz of desktop-agent/ generated on-the-fly by `tar`.
// Run from the repo root (parent of `web/`).
export async function GET() {
  const repoRoot = join(process.cwd(), '..')

  // Exclude .venv and *.egg-info so the tarball stays small and reproducible.
  const proc = spawn(
    'tar',
    ['-czf', '-', '--exclude=.venv', '--exclude=*.egg-info', '--exclude=__pycache__', 'desktop-agent'],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const body = new ReadableStream({
    start(controller) {
      proc.stdout.on('data', (chunk: Buffer) => {
        try { controller.enqueue(chunk) } catch { /* downstream closed */ }
      })
      proc.stdout.on('end',   () => { try { controller.close() } catch {} })
      proc.stderr.on('data',  (c: Buffer) => console.error('[install/package] tar stderr:', c.toString()))
      proc.on('error', (err) => controller.error(err))
      proc.on('exit',  (code) => { if (code !== 0) controller.error(new Error(`tar exited with code ${code}`)) })
    },
    cancel() { proc.kill('SIGTERM') },
  })

  return new Response(body, {
    headers: {
      'Content-Type':  'application/gzip',
      'Cache-Control': 'no-store',
    },
  })
}
