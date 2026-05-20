import { describe, it, expect } from 'vitest'
import { generateCode, generateDeviceToken } from './utils'

describe('generateCode', () => {
  it('produces ABC-123 format (3 chars, dash, 3 chars, uppercase alphanum)', () => {
    const code = generateCode()
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)
  })

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 200 }, generateCode))
    expect(codes.size).toBeGreaterThan(180)
  })
})

describe('generateDeviceToken', () => {
  it('starts with dt_ prefix', () => {
    expect(generateDeviceToken()).toMatch(/^dt_/)
  })

  it('has at least 32 chars after prefix', () => {
    const token = generateDeviceToken()
    expect(token.slice(3).length).toBeGreaterThanOrEqual(32)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateDeviceToken))
    expect(tokens.size).toBe(200)
  })
})
