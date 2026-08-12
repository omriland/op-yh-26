import { describe, expect, it } from 'vitest'
import { shouldReuseOtpChallenge } from './otpStartPolicy'

const COOLDOWN_MS = 60_000

describe('shouldReuseOtpChallenge', () => {
  it('reuses a fresh unexpired challenge instead of sending again', () => {
    const now = Date.parse('2026-08-12T10:00:30.000Z')
    const createdAt = '2026-08-12T10:00:00.000Z'
    expect(shouldReuseOtpChallenge(createdAt, now, COOLDOWN_MS)).toBe(true)
  })

  it('allows a new send after the cooldown window', () => {
    const now = Date.parse('2026-08-12T10:01:01.000Z')
    const createdAt = '2026-08-12T10:00:00.000Z'
    expect(shouldReuseOtpChallenge(createdAt, now, COOLDOWN_MS)).toBe(false)
  })

  it('rejects invalid timestamps', () => {
    expect(shouldReuseOtpChallenge('not-a-date', Date.now(), COOLDOWN_MS)).toBe(false)
  })
})
