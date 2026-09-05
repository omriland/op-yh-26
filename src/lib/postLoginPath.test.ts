import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST_LOGIN_PATH_KEY, stashPostLoginPath, takePostLoginPath } from './postLoginPath'

const store = new Map<string, string>()

function stubSessionStorage() {
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })
}

beforeEach(() => {
  store.clear()
  stubSessionStorage()
})

afterEach(() => {
  store.clear()
  vi.unstubAllGlobals()
})

describe('postLoginPath', () => {
  it('round-trips a safe path', () => {
    stashPostLoginPath('/ios')
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBe('/ios')
    expect(takePostLoginPath()).toBe('/ios')
    expect(takePostLoginPath()).toBeNull()
  })

  it('rejects open redirects', () => {
    stashPostLoginPath('https://evil.example')
    expect(sessionStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull()
  })
})
