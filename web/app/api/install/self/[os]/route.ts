import { NextRequest } from 'next/server'

type OS = 'macos' | 'linux' | 'windows'

const VALID_OS: ReadonlyArray<OS> = ['macos', 'linux', 'windows']

function isOs(v: string): v is OS {
  return (VALID_OS as ReadonlyArray<string>).includes(v)
}

// Resolve the public origin of this server from the incoming request so the
// script can curl back to the same host.
function originFromRequest(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const host = forwardedHost ?? req.headers.get('host') ?? 'localhost'
  const proto = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function macLinuxScript(origin: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

CLOUD_URL="${origin}"
INSTALL_DIR="$HOME/.local/share/guidenco-client"
BIN_DIR="$HOME/.local/bin"

echo "[guidenco-client] Installing into $INSTALL_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required. Install Python 3.10+ from https://www.python.org" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

echo "[guidenco-client] Downloading package..."
curl -fsSL "$CLOUD_URL/api/install/self/package.tar.gz" | tar -xz -C "$INSTALL_DIR"

echo "[guidenco-client] Creating virtual env..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet "$INSTALL_DIR/desktop-agent"

ln -sf "$INSTALL_DIR/venv/bin/guidenco-client" "$BIN_DIR/guidenco-client"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "[guidenco-client] NOTE: $BIN_DIR is not on your PATH. Add it to your shell rc to run 'guidenco-client' directly." ;;
esac

echo ""
echo "[guidenco-client] Installed. Starting pairing..."
echo ""

GUIDENCO_CLOUD_URL="$CLOUD_URL" "$INSTALL_DIR/venv/bin/guidenco-client" init
`
}

function windowsScript(origin: string): string {
  return `$ErrorActionPreference = "Stop"

$cloudUrl = "${origin}"
$installDir = Join-Path $env:LOCALAPPDATA "guidenco-client"

Write-Host "[guidenco-client] Installing into $installDir"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw "Python is required. Install Python 3.10+ from https://www.python.org" }

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host "[guidenco-client] Downloading package..."
$tarPath = Join-Path $installDir "package.tar.gz"
Invoke-WebRequest "$cloudUrl/api/install/self/package.tar.gz" -OutFile $tarPath -UseBasicParsing
tar -xzf $tarPath -C $installDir

Write-Host "[guidenco-client] Creating virtual env..."
python -m venv "$installDir\\venv"
& "$installDir\\venv\\Scripts\\pip.exe" install --quiet --upgrade pip
& "$installDir\\venv\\Scripts\\pip.exe" install --quiet "$installDir\\desktop-agent"

Write-Host ""
Write-Host "[guidenco-client] Installed. Starting pairing..."
Write-Host ""

$env:GUIDENCO_CLOUD_URL = $cloudUrl
& "$installDir\\venv\\Scripts\\guidenco-client.exe" init
`
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ os: string }> }) {
  const { os } = await ctx.params
  if (!isOs(os)) {
    return new Response(`Unknown OS: ${os}`, { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }
  const origin = originFromRequest(req)
  const body   = os === 'windows' ? windowsScript(origin) : macLinuxScript(origin)
  return new Response(body, {
    status:  200,
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
