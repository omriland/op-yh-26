import { describe, expect, it } from 'vitest'
import {
  PRIVACY_TOKEN_TTL_SEC,
  buildPrivacyPolicyUrl,
  createPrivacyPageToken,
  isPrivacyPath,
  parsePrivacyTokenFromSearch,
  verifyPrivacyPageToken,
} from './privacyPageToken'

const TEST_SECRET = 'test-privacy-secret'
const TEST_NOW = 1_700_000_000
const TEST_VECTOR =
  '1700000900.1b55aad767119a9b8b62ab8bd7ea29c13774c7f37a979ab966f7375a4abafa02'

describe('isPrivacyPath', () => {
  it('matches /privacy only', () => {
    expect(isPrivacyPath('/privacy')).toBe(true)
    expect(isPrivacyPath('/privacy/')).toBe(true)
    expect(isPrivacyPath('/android')).toBe(false)
    expect(isPrivacyPath('/')).toBe(false)
  })
})

describe('parsePrivacyTokenFromSearch', () => {
  it('reads t from the query', () => {
    expect(parsePrivacyTokenFromSearch(`?t=${TEST_VECTOR}`)).toBe(TEST_VECTOR)
    expect(parsePrivacyTokenFromSearch(`t=${TEST_VECTOR}`)).toBe(TEST_VECTOR)
    expect(parsePrivacyTokenFromSearch('?fill_token=nope')).toBeNull()
    expect(parsePrivacyTokenFromSearch('')).toBeNull()
  })
})

describe('privacy page HMAC token', () => {
  it('matches the locked Android/web test vector', async () => {
    const token = await createPrivacyPageToken(TEST_SECRET, TEST_NOW)
    expect(token).toBe(TEST_VECTOR)
    await expect(verifyPrivacyPageToken(TEST_SECRET, token, TEST_NOW)).resolves.toBe(true)
  })

  it('rejects a missing, expired, future, or tampered token', async () => {
    const token = await createPrivacyPageToken(TEST_SECRET, TEST_NOW)
    await expect(verifyPrivacyPageToken(TEST_SECRET, token, TEST_NOW + PRIVACY_TOKEN_TTL_SEC + 61)).resolves.toBe(
      false,
    )
    await expect(verifyPrivacyPageToken(TEST_SECRET, token, TEST_NOW - PRIVACY_TOKEN_TTL_SEC - 61)).resolves.toBe(
      false,
    )
    await expect(verifyPrivacyPageToken(TEST_SECRET, token.slice(0, -1) + '0', TEST_NOW)).resolves.toBe(false)
    await expect(verifyPrivacyPageToken('other-secret', token, TEST_NOW)).resolves.toBe(false)
    await expect(verifyPrivacyPageToken(TEST_SECRET, '', TEST_NOW)).resolves.toBe(false)
  })
})

describe('buildPrivacyPolicyUrl', () => {
  it('keeps /privacy private unless t is present', () => {
    expect(buildPrivacyPolicyUrl('https://yahpz.com', TEST_VECTOR)).toBe(
      `https://yahpz.com/privacy?t=${TEST_VECTOR}`,
    )
  })
})
