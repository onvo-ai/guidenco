/**
 * cloudflare-turn.ts — generates ephemeral Cloudflare TURN credentials.
 *
 * Requires two env vars:
 *   CLOUDFLARE_TURN_KEY_ID    — the TURN key ID from the Cloudflare Calls dashboard
 *   CLOUDFLARE_TURN_API_TOKEN — a Cloudflare API token with "Cloudflare Calls: Edit" permission
 *
 * If either var is absent, falls back to STUN-only (same behaviour as before).
 */

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

interface CloudflareTurnResponse {
  iceServers: {
    urls: string[]
    username: string
    credential: string
  }
}

/**
 * Generates a fresh set of ICE servers (STUN + ephemeral TURN credentials).
 * Always resolves — falls back to STUN-only on any failure.
 */
export async function generateTurnCredentials(): Promise<IceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN

  if (!keyId || !token) {
    return [{ urls: 'stun:stun.l.google.com:19302' }]
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 86400 }),
      },
    )

    if (!res.ok) {
      console.error(`[turn] Cloudflare credential request failed: ${res.status} ${await res.text()}`)
      return [{ urls: 'stun:stun.l.google.com:19302' }]
    }

    const data = (await res.json()) as CloudflareTurnResponse
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      data.iceServers,
    ]
  } catch (err) {
    console.error('[turn] Failed to generate Cloudflare TURN credentials:', err)
    return [{ urls: 'stun:stun.l.google.com:19302' }]
  }
}
