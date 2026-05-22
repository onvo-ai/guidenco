import { readFile } from 'fs/promises'
import { join } from 'path'

// Serves service/install.sh as text so users can pipe it to bash on their Pi:
//   curl -fsSL <host>/api/install/bridged | sudo bash
// The script reads GUIDENCO_CLOUD_URL from env, so the user can prepend
//   GUIDENCO_CLOUD_URL=<host> sudo bash
// when running it (or set it once in /etc/environment).
export async function GET() {
  try {
    const path = join(process.cwd(), '..', 'service', 'install.sh')
    const body = await readFile(path, 'utf8')
    return new Response(body, {
      status:  200,
      headers: {
        'Content-Type':  'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return Response.json({ error: 'Install script not found' }, { status: 500 })
  }
}
