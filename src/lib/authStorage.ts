import type { SupportedStorage } from '@supabase/supabase-js'
import {
  defaultRememberLoginStorage,
  isRememberLoginEnabled,
  type StorageLike,
} from './rememberLogin'

function sessionStore(): StorageLike | null {
  try {
    if (typeof globalThis.sessionStorage === 'undefined') return null
    return globalThis.sessionStorage
  } catch {
    return null
  }
}

export function createAuthStorage(
  getLocal: () => StorageLike | null = defaultRememberLoginStorage,
  getSession: () => StorageLike | null = sessionStore,
  rememberEnabled: () => boolean = () => isRememberLoginEnabled(getLocal()),
): SupportedStorage {
  return {
    getItem(key) {
      const local = getLocal()
      const session = getSession()
      const primary = rememberEnabled() ? local : session
      const secondary = rememberEnabled() ? session : local
      return primary?.getItem(key) ?? secondary?.getItem(key) ?? null
    },
    setItem(key, value) {
      const local = getLocal()
      const session = getSession()
      if (rememberEnabled()) {
        local?.setItem(key, value)
        session?.removeItem(key)
      } else {
        session?.setItem(key, value)
        local?.removeItem(key)
      }
    },
    removeItem(key) {
      getLocal()?.removeItem(key)
      getSession()?.removeItem(key)
    },
  }
}

export const authStorage = createAuthStorage()
