import { afterEach, describe, expect, it } from 'vitest'
import {
  POST_LOGIN_FILL_KEY,
  clearPostLoginFill,
  consumeFillEventTarget,
  parseFillEventFromSearch,
  parseFillTokenFromSearch,
  readPostLoginFill,
  stashPostLoginFill,
} from './fillTokenIntent'

function stubSessionStorage() {
  const store = new Map<string, string>()
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorage,
    configurable: true,
  })
  return store
}

afterEach(() => {
  try {
    sessionStorage.clear?.()
  } catch {
    // ignore
  }
})

describe('fillTokenIntent URL parse', () => {
  it('reads fill_token from search', () => {
    expect(parseFillTokenFromSearch('?fill_token=abc123')).toBe('abc123')
    expect(parseFillTokenFromSearch('fill_token=xyz')).toBe('xyz')
    expect(parseFillTokenFromSearch('?other=1')).toBeNull()
  })

  it('reads fill_event from search', () => {
    expect(parseFillEventFromSearch('?fill_event=evt-1')).toBe('evt-1')
    expect(parseFillEventFromSearch('')).toBeNull()
  })
})

describe('fillTokenIntent stash', () => {
  it('stashes and reads post-login fill', () => {
    stubSessionStorage()
    stashPostLoginFill('event-99')
    expect(readPostLoginFill()).toEqual({ eventId: 'event-99' })
    expect(sessionStorage.getItem(POST_LOGIN_FILL_KEY)).toContain('event-99')
    clearPostLoginFill()
    expect(readPostLoginFill()).toBeNull()
  })

  it('consumeFillEventTarget prefers query then stash', () => {
    stubSessionStorage()
    stashPostLoginFill('stashed')
    expect(consumeFillEventTarget('?fill_event=from-query')).toBe('from-query')
    expect(readPostLoginFill()).toBeNull()

    stashPostLoginFill('stashed-2')
    expect(consumeFillEventTarget('')).toBe('stashed-2')
    expect(readPostLoginFill()).toBeNull()
  })
})
