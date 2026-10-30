import { describe, expect, it } from 'vitest'
import {
  INVITE_TTL_MS,
  inviteExpiresAt,
  isInviteExpired,
  reusableInviteToken,
} from '../../supabase/functions/_shared/inviteTtl'

const HOUR = 60 * 60 * 1000

describe('invite TTL', () => {
  it('is 7 days', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * HOUR)
  })

  it('treats a 30-minute-old invite as still valid', () => {
    const issuedAt = Date.parse('2026-09-01T07:15:00.000Z')
    const expiresAt = inviteExpiresAt(issuedAt)
    expect(isInviteExpired(expiresAt, issuedAt + 30 * 60 * 1000)).toBe(false)
  })

  it('expires only after 7 days', () => {
    const issuedAt = Date.parse('2026-09-01T07:15:00.000Z')
    const expiresAt = inviteExpiresAt(issuedAt)
    const ttl = 7 * 24 * HOUR
    expect(isInviteExpired(expiresAt, issuedAt + ttl - 1)).toBe(false)
    expect(isInviteExpired(expiresAt, issuedAt + ttl)).toBe(false)
    expect(isInviteExpired(expiresAt, issuedAt + ttl + 1)).toBe(true)
  })
})

describe('reusableInviteToken (copy invite link)', () => {
  const now = Date.parse('2026-10-30T15:00:00.000Z')
  const token = '11111111-2222-4333-8444-555555555555'

  it('reuses the member’s current token while it is valid, so the emailed link keeps working', () => {
    expect(reusableInviteToken({ token, expiresAt: inviteExpiresAt(now - HOUR) }, now)).toBe(token)
  })

  it('returns null when there is no token or it has expired, so a fresh one is minted', () => {
    expect(reusableInviteToken({ token: null, expiresAt: inviteExpiresAt(now) }, now)).toBeNull()
    expect(reusableInviteToken({ token, expiresAt: new Date(now - 1).toISOString() }, now)).toBeNull()
    expect(reusableInviteToken({ token: '  ', expiresAt: inviteExpiresAt(now) }, now)).toBeNull()
  })
})
