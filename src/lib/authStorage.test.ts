import { describe, expect, it } from 'vitest'
import { createAuthStorage } from './authStorage'
import type { StorageLike } from './rememberLogin'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
    removeItem(key: string) {
      data.delete(key)
    },
  }
}

describe('authStorage', () => {
  it('writes the session to localStorage when remember is on', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    session.setItem('sb', 'old-session')
    const storage = createAuthStorage(
      () => local,
      () => session,
      () => true,
    )
    storage.setItem('sb', 'token')
    expect(local.getItem('sb')).toBe('token')
    expect(session.getItem('sb')).toBeNull()
  })

  it('writes the session to sessionStorage and clears local when remember is off', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    local.setItem('sb', 'old-local')
    const storage = createAuthStorage(
      () => local,
      () => session,
      () => false,
    )
    storage.setItem('sb', 'token')
    expect(session.getItem('sb')).toBe('token')
    expect(local.getItem('sb')).toBeNull()
  })

  it('reads from the other store when the preferred one is empty', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    local.setItem('sb', 'from-local')
    const storage = createAuthStorage(
      () => local,
      () => session,
      () => false,
    )
    expect(storage.getItem('sb')).toBe('from-local')
  })

  it('removes the key from both stores', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    local.setItem('sb', 'a')
    session.setItem('sb', 'b')
    const storage = createAuthStorage(
      () => local,
      () => session,
      () => true,
    )
    storage.removeItem('sb')
    expect(local.getItem('sb')).toBeNull()
    expect(session.getItem('sb')).toBeNull()
  })

  it('keeps the session in memory when the browser drops the write (in-app browsers)', () => {
    const dropping: StorageLike = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const storage = createAuthStorage(
      () => dropping,
      () => dropping,
      () => true,
    )
    storage.setItem('sb', 'token')
    expect(storage.getItem('sb')).toBe('token')
    storage.removeItem('sb')
    expect(storage.getItem('sb')).toBeNull()
  })

  it('keeps the session in memory when the browser refuses the write', () => {
    const refusing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
      removeItem: () => {},
    }
    const storage = createAuthStorage(
      () => refusing,
      () => refusing,
      () => true,
    )
    expect(() => storage.setItem('sb', 'token')).not.toThrow()
    expect(storage.getItem('sb')).toBe('token')
  })

  it('prefers the real store over the memory copy', () => {
    const local = memoryStorage()
    const storage = createAuthStorage(
      () => local,
      () => null,
      () => true,
    )
    storage.setItem('sb', 'token')
    local.setItem('sb', 'refreshed-elsewhere')
    expect(storage.getItem('sb')).toBe('refreshed-elsewhere')
  })
})
