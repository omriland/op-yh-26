import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REMEMBER_LOGIN_STORAGE_KEY,
  REMEMBER_LOGIN_TTL_MS,
  ensureRememberSessionUntil,
  isRememberLoginEnabled,
  isRememberSessionExpired,
  readBrowserPassword,
  readRememberLogin,
  storeBrowserPassword,
  writeRememberLogin,
} from './rememberLogin'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

describe('rememberLogin', () => {
  it('defaults to remember-on with no email when nothing is stored', () => {
    const storage = memoryStorage()
    expect(readRememberLogin(storage)).toEqual({ remember: true, email: null })
    expect(isRememberLoginEnabled(storage)).toBe(true)
    expect(isRememberSessionExpired(storage, 1_000)).toBe(false)
  })

  it('stores email and a 30-day session cap when remember is on', () => {
    const storage = memoryStorage()
    const now = 1_700_000_000_000
    writeRememberLogin({ remember: true, email: '  omri@example.com  ' }, storage, now)
    expect(readRememberLogin(storage)).toEqual({
      remember: true,
      email: 'omri@example.com',
    })
    expect(JSON.parse(storage.getItem(REMEMBER_LOGIN_STORAGE_KEY) ?? '{}')).toEqual({
      remember: true,
      email: 'omri@example.com',
      until: now + REMEMBER_LOGIN_TTL_MS,
    })
    expect(isRememberSessionExpired(storage, now + REMEMBER_LOGIN_TTL_MS - 1)).toBe(false)
    expect(isRememberSessionExpired(storage, now + REMEMBER_LOGIN_TTL_MS)).toBe(true)
  })

  it('forgets email and does not expire a session when remember is off', () => {
    const storage = memoryStorage()
    writeRememberLogin({ remember: true, email: 'omri@example.com' }, storage, 10)
    writeRememberLogin({ remember: false, email: 'omri@example.com' }, storage, 20)
    expect(readRememberLogin(storage)).toEqual({ remember: false, email: null })
    expect(isRememberLoginEnabled(storage)).toBe(false)
    expect(isRememberSessionExpired(storage, 20 + REMEMBER_LOGIN_TTL_MS + 1)).toBe(false)
  })

  it('stamps a 30-day cap on a remembered session that has no until', () => {
    const storage = memoryStorage()
    storage.setItem(
      REMEMBER_LOGIN_STORAGE_KEY,
      JSON.stringify({ remember: true, email: 'a@b.com' }),
    )
    const now = 50
    ensureRememberSessionUntil(storage, now)
    expect(isRememberSessionExpired(storage, now + REMEMBER_LOGIN_TTL_MS - 1)).toBe(false)
    expect(isRememberSessionExpired(storage, now + REMEMBER_LOGIN_TTL_MS)).toBe(true)
    expect(readRememberLogin(storage).email).toBe('a@b.com')
  })

  it('does not invent a cap when the user opted out', () => {
    const storage = memoryStorage()
    writeRememberLogin({ remember: false, email: '' }, storage, 1)
    ensureRememberSessionUntil(storage, 2)
    expect(JSON.parse(storage.getItem(REMEMBER_LOGIN_STORAGE_KEY) ?? '{}').until).toBeNull()
  })

  it('ignores corrupt storage', () => {
    const storage = memoryStorage()
    storage.setItem(REMEMBER_LOGIN_STORAGE_KEY, '{not-json')
    expect(readRememberLogin(storage)).toEqual({ remember: true, email: null })
    expect(isRememberSessionExpired(storage)).toBe(false)
  })
})

describe('browser password credentials', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores a PasswordCredential when the browser supports it', async () => {
    const store = vi.fn().mockResolvedValue(undefined)
    class PasswordCredential {
      id: string
      password: string
      constructor(data: { id: string; password: string }) {
        this.id = data.id
        this.password = data.password
      }
    }
    vi.stubGlobal('PasswordCredential', PasswordCredential)
    vi.stubGlobal('navigator', { credentials: { store, get: vi.fn() } })

    await storeBrowserPassword('  a@b.com ', 'secret')
    expect(store).toHaveBeenCalledTimes(1)
    const cred = store.mock.calls[0]?.[0] as { id: string; password: string }
    expect(cred.id).toBe('a@b.com')
    expect(cred.password).toBe('secret')
  })

  it('reads a saved password credential', async () => {
    vi.stubGlobal('navigator', {
      credentials: {
        store: vi.fn(),
        get: vi.fn().mockResolvedValue({ type: 'password', id: 'a@b.com', password: 'secret' }),
      },
    })
    await expect(readBrowserPassword()).resolves.toEqual({
      email: 'a@b.com',
      password: 'secret',
    })
  })

  it('returns null when credentials are unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await expect(storeBrowserPassword('a@b.com', 'secret')).resolves.toBeUndefined()
    await expect(readBrowserPassword()).resolves.toBeNull()
  })
})
