import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  capturePasswordSetupIntent,
  clearPasswordSetupIntent,
  getPasswordSetupReason,
  markPasswordSetupRequired,
  readAuthTokenFromSearch,
  readInviteTokenFromSearch,
  readStashedInviteToken,
  resolveInviteToken,
  stashInviteToken,
  stripPasswordSetupFromUrl,
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

  it('does not arm invite from type=invite without a token', () => {
    stubSessionStorage()
    capturePasswordSetupIntent('', '?set_password=1&type=invite')
    expect(getPasswordSetupReason()).toBeNull()
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

describe('durable invite_token persistence', () => {
  const token = '11111111-1111-1111-1111-111111111111'

  it('keeps invite_token in the URL so a lost sessionStorage still redeems', () => {
    stubSessionStorage()
    const href = `https://yahpz.com/?set_password=1&type=invite&invite_token=${token}`
    const replaced: string[] = []
    vi.stubGlobal('window', {
      location: { href, search: `?set_password=1&type=invite&invite_token=${token}` },
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, next: string) => {
          replaced.push(next)
        },
      },
    })
    stripPasswordSetupFromUrl()
    expect(replaced).toHaveLength(0)
  })

  it('resolves invite_token from the URL when stash is empty', () => {
    stubSessionStorage()
    expect(
      resolveInviteToken(`?set_password=1&type=invite&invite_token=${token}`),
    ).toBe(token)
    expect(readStashedInviteToken()).toBe(token)
  })

  it('resolves a stashed invite_token when the URL was already cleaned', () => {
    stubSessionStorage()
    stashInviteToken(token)
    expect(resolveInviteToken('')).toBe(token)
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

describe('admin_reset reason', () => {
  it('persists admin_reset in session storage', () => {
    stubSessionStorage()
    markPasswordSetupRequired('admin_reset')
    expect(getPasswordSetupReason()).toBe('admin_reset')
  })
})
