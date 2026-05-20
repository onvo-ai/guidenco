import { randomBytes } from 'crypto'

const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateCode(): string {
  const bytes = randomBytes(6)
  const chars = Array.from(bytes, (b) => ALPHANUM[b % ALPHANUM.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3, 6).join('')}`
}

export function generateDeviceToken(): string {
  return `dt_${randomBytes(24).toString('hex')}`
}
