import { describe, expect, it } from 'vitest'
import { OTP_START_COOLDOWN_MS, shouldReuseOtpChallenge } from './otpStartPolicy'

describe('OTP_START_COOLDOWN_MS', () => {
  it('waits 100 seconds so a late first SMS is still the valid code', () => {
    expect(OTP_START_COOLDOWN_MS).toBe(100_000)
  })
})

describe('shouldReuseOtpChallenge', () => {
  it('reuses a fresh unexpired challenge instead of sending again', () => {
    const now = Date.parse('2026-08-12T10:00:30.000Z')
    const createdAt = '2026-08-12T10:00:00.000Z'
    expect(shouldReuseOtpChallenge(createdAt, now, OTP_START_COOLDOWN_MS)).toBe(true)
  })

  it('still reuses the first code at 90s while SMS may still be in flight', () => {
    const now = Date.parse('2026-08-12T10:01:30.000Z')
    const createdAt = '2026-08-12T10:00:00.000Z'
    expect(shouldReuseOtpChallenge(createdAt, now, OTP_START_COOLDOWN_MS)).toBe(true)
  })

  it('allows a new send after the 100s cooldown window', () => {
    const now = Date.parse('2026-08-12T10:01:40.000Z')
    const createdAt = '2026-08-12T10:00:00.000Z'
    expect(shouldReuseOtpChallenge(createdAt, now, OTP_START_COOLDOWN_MS)).toBe(false)
  })

  it('rejects invalid timestamps', () => {
    expect(shouldReuseOtpChallenge('not-a-date', Date.now(), OTP_START_COOLDOWN_MS)).toBe(false)
  })
})
