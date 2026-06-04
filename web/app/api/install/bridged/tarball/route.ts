import { spawn } from 'child_process'
import { join } from 'path'

// Streams a fresh tar.gz of pi-agent/ generated on-the-fly by `tar`.
// install.sh downloads this, extracts it, and rsyncs pi-agent/ into /opt/guidenco.
// Run from the repo root (parent of `web/`).
export async function GET() {
  const repoRoot = join(process.cwd(), '..')

  const proc = spawn(
    'tar',
    ['-czf', '-', '--exclude=__pycache__', '--exclude=venv', '--exclude=*.pyc', 'pi-agent'],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const body = new ReadableStream({
    start(controller) {
      proc.stdout.on('data', (chunk: Buffer) => {
        try { controller.enqueue(chunk) } catch { /* downstream closed */ }
      })
      proc.stdout.on('end',   () => { try { controller.close() } catch {} })
      proc.stderr.on('data',  (c: Buffer) => console.error('[install/bridged/tarball] tar stderr:', c.toString()))
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
