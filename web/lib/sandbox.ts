/**
 * sandbox.ts — wraps the e2b SDK for managed Remote desktops.
 *
 * Each Remote device gets a long-lived e2b sandbox. We boot the sandbox, drop
 * the device's config in place, download the guidenco-client package from our
 * own /api/install/self/package.tar.gz endpoint, install it, and start it in
 * the background. The sandbox then behaves like any other Self-mode client.
 *
 * The e2b API key is server-side only (process.env.E2B_API_KEY). The user does
 * NOT supply their own key — Remote sandboxes are app-owned.
 */
import { Sandbox } from 'e2b'

const TEMPLATE = process.env.E2B_TEMPLATE ?? 'desktop'

// 12 hours; the janitor terminates after 1 hour offline, but we want the
// sandbox to outlive any transient browser disconnects.
const SANDBOX_TIMEOUT_MS = 12 * 60 * 60 * 1000

function apiKey(): string {
  const key = process.env.E2B_API_KEY
  if (!key) throw new Error('E2B_API_KEY is not set — cannot provision Remote sandboxes')
  return key
}

/** Boots a sandbox, installs guidenco-client, and starts it. Returns the sandbox id. */
export async function createSandbox(deviceId: string, deviceToken: string, cloudUrl: string): Promise<string> {
  const sandbox = await Sandbox.create(TEMPLATE, {
    apiKey:    apiKey(),
    timeoutMs: SANDBOX_TIMEOUT_MS,
  })

  // The config file the Phase-2 CLI's `run` subcommand reads.
  const config = JSON.stringify({
    cloud_url:    cloudUrl,
    device_id:    deviceId,
    device_token: deviceToken,
  })

  // Bootstrap script — runs inside the sandbox. Uses bash so heredocs and pipes
  // behave predictably. nohup lets the client outlive the spawning shell.
  const bootstrap = `
set -euo pipefail

mkdir -p ~/.config/guidenco-client
cat > ~/.config/guidenco-client/device.json <<'EOF'
${config}
EOF

mkdir -p /opt/guidenco
curl -fsSL "${cloudUrl}/api/install/self/package.tar.gz" | tar -xz -C /opt/guidenco

python3 -m venv /opt/guidenco/venv
/opt/guidenco/venv/bin/pip install --quiet --upgrade pip
/opt/guidenco/venv/bin/pip install --quiet /opt/guidenco/guidenco_client

nohup /opt/guidenco/venv/bin/guidenco-client run > /tmp/guidenco-client.log 2>&1 &
`

  await sandbox.commands.run(bootstrap)

  return sandbox.sandboxId
}

/** Terminates a sandbox. Idempotent — swallows "not found" errors. */
export async function terminateSandbox(sandboxId: string): Promise<void> {
  try {
    await Sandbox.kill(sandboxId, { apiKey: apiKey() })
  } catch (err) {
    console.warn(`[sandbox] terminate(${sandboxId}) ignored:`, err instanceof Error ? err.message : err)
  }
}
