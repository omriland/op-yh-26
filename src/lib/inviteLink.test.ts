import { describe, expect, it } from 'vitest'
import { buildBrandedInviteUrl } from './inviteLink'

describe('buildBrandedInviteUrl', () => {
  it('builds a yahpz.com link with token_hash and invite type', () => {
    const href = buildBrandedInviteUrl({
      redirectBase: 'https://yahpz.com/',
      hashedToken: 'abc123',
    })
    const url = new URL(href)
    expect(url.origin).toBe('https://yahpz.com')
    expect(url.searchParams.get('set_password')).toBe('1')
    expect(url.searchParams.get('type')).toBe('invite')
    expect(url.searchParams.get('token_hash')).toBe('abc123')
  })

  it('does not include supabase.co', () => {
    const href = buildBrandedInviteUrl({
      redirectBase: 'https://yahpz.com/',
      hashedToken: 'tok',
    })
    expect(href).not.toMatch(/supabase\.co/i)
  })
})
