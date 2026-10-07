import { describe, expect, it } from 'vitest'
import {
  FILL_TOKEN_TTL_MS,
  deterministicFillToken,
  fillTokenExpiresAt,
  fillTokenMintDecision,
  isFillTokenExpired,
  sha256Hex,
} from '../../supabase/functions/_shared/fillTokenTtl'

const DAY = 24 * 60 * 60 * 1000

describe('fill token TTL', () => {
  it('is 180 days (~6 months)', () => {
    expect(FILL_TOKEN_TTL_MS).toBe(180 * DAY)
  })

  it('stays valid weeks after mint', () => {
    const issuedAt = Date.parse('2026-10-05T12:00:00.000Z')
    const expiresAt = Date.parse(fillTokenExpiresAt(issuedAt))
    expect(expiresAt).toBe(issuedAt + 180 * DAY)
    expect(expiresAt).toBeGreaterThan(issuedAt + 21 * DAY)
  })

  it('is still valid months later so the same email can be reopened', () => {
    const issuedAt = Date.parse('2026-10-05T12:00:00.000Z')
    const expiresAt = fillTokenExpiresAt(issuedAt)
    const fiveMonthsLater = issuedAt + 150 * DAY
    expect(isFillTokenExpired(expiresAt, fiveMonthsLater)).toBe(false)
    expect(isFillTokenExpired(expiresAt, issuedAt + 180 * DAY)).toBe(true)
  })
})

describe('fillTokenMintDecision', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z')
  const later = new Date(now + 180 * DAY).toISOString()

  it('reuses a still-valid deterministic token', () => {
    expect(
      fillTokenMintDecision({
        storedHash: 'abc',
        expiresAt: later,
        deterministicHash: 'abc',
        nowMs: now,
      }),
    ).toBe('reuse')
  })

  it('keeps a still-valid legacy email token so the original link still works', () => {
    expect(
      fillTokenMintDecision({
        storedHash: 'old-random',
        expiresAt: later,
        deterministicHash: 'abc',
        nowMs: now,
      }),
    ).toBe('keep-legacy')
  })

  it('may replace a legacy hash only before the first email goes out', () => {
    expect(
      fillTokenMintDecision({
        storedHash: 'old-random',
        expiresAt: later,
        deterministicHash: 'abc',
        nowMs: now,
        replaceLegacy: true,
      }),
    ).toBe('mint')
  })

  it('mints when missing or expired', () => {
    expect(
      fillTokenMintDecision({
        storedHash: null,
        expiresAt: later,
        deterministicHash: 'abc',
        nowMs: now,
      }),
    ).toBe('mint')
    expect(
      fillTokenMintDecision({
        storedHash: 'abc',
        expiresAt: new Date(now - 1).toISOString(),
        deterministicHash: 'abc',
        nowMs: now,
      }),
    ).toBe('mint')
    expect(isFillTokenExpired(later, now)).toBe(false)
    expect(isFillTokenExpired(new Date(now).toISOString(), now)).toBe(true)
  })
})

describe('deterministicFillToken', () => {
  it('repeats the same raw token for the same assignment', async () => {
    const a = await deterministicFillToken('assignment-1', 'secret')
    const b = await deterministicFillToken('assignment-1', 'secret')
    const other = await deterministicFillToken('assignment-2', 'secret')
    expect(a).toBe(b)
    expect(a).not.toBe(other)
    expect(await sha256Hex(a)).toHaveLength(64)
  })
})
