import { describe, expect, it } from 'vitest'
import {
  INVITE_TTL_MS,
  inviteExpiresAt,
  isInviteExpired,
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
