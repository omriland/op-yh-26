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
  // Some in-app browsers drop or refuse storage writes. Keep the last value in
  // memory too, so a fresh sign-in still works in this tab.
  const memory = new Map<string, string>()
  return {
    getItem(key) {
      const local = getLocal()
      const session = getSession()
      const primary = rememberEnabled() ? local : session
      const secondary = rememberEnabled() ? session : local
      return primary?.getItem(key) ?? secondary?.getItem(key) ?? memory.get(key) ?? null
    },
    setItem(key, value) {
      memory.set(key, value)
      const local = getLocal()
      const session = getSession()
      try {
        if (rememberEnabled()) {
          local?.setItem(key, value)
          session?.removeItem(key)
        } else {
          session?.setItem(key, value)
          local?.removeItem(key)
        }
      } catch {
        /* storage blocked or full: the memory copy stands in */
      }
    },
    removeItem(key) {
      memory.delete(key)
      getLocal()?.removeItem(key)
      getSession()?.removeItem(key)
    },
  }
}

export const authStorage = createAuthStorage()
