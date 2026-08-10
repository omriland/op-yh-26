import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  capturePasswordSetupIntent,
  clearPasswordSetupIntent,
  getPasswordSetupReason,
  readAuthTokenFromSearch,
  readInviteTokenFromSearch,
} from './passwordSetup'

const store = new Map<string, string>()

afterEach(() => {
  store.clear()
  vi.unstubAllGlobals()
})

function stubSessionStorage() {
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  })
}

describe('capturePasswordSetupIntent', () => {
  it('arms invite intent from branded token_hash query', () => {
    stubSessionStorage()
    capturePasswordSetupIntent('', '?set_password=1&type=invite&token_hash=abc')
    expect(getPasswordSetupReason()).toBe('invite')
  })

  it('arms invite intent from durable invite_token query', () => {
    stubSessionStorage()
    capturePasswordSetupIntent(
      '',
      '?set_password=1&type=invite&invite_token=11111111-1111-1111-1111-111111111111',
    )
    expect(getPasswordSetupReason()).toBe('invite')
  })

  it('arms recovery from type=recovery', () => {
    stubSessionStorage()
    capturePasswordSetupIntent('', '?type=recovery&token_hash=abc')
    expect(getPasswordSetupReason()).toBe('recovery')
  })
})

describe('readAuthTokenFromSearch', () => {
  it('reads token_hash + type for verifyOtp', () => {
    expect(readAuthTokenFromSearch('?set_password=1&type=invite&token_hash=abc')).toEqual({
      token_hash: 'abc',
      type: 'invite',
    })
  })

  it('returns null without token_hash', () => {
    expect(readAuthTokenFromSearch('?type=invite')).toBeNull()
  })
})

describe('readInviteTokenFromSearch', () => {
  it('reads durable invite_token', () => {
    expect(
      readInviteTokenFromSearch(
        '?set_password=1&type=invite&invite_token=11111111-1111-1111-1111-111111111111',
      ),
    ).toBe('11111111-1111-1111-1111-111111111111')
  })
})

describe('clearPasswordSetupIntent', () => {
  it('clears the session flag', () => {
    stubSessionStorage()
    capturePasswordSetupIntent('', '?type=invite&token_hash=x')
    clearPasswordSetupIntent()
    expect(getPasswordSetupReason()).toBeNull()
  })
})
