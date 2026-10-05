import { describe, expect, it } from 'vitest'
import {
  FILL_TOKEN_TTL_MS,
  fillTokenExpiresAt,
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
})
