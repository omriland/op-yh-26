import { useEffect, useState } from 'react'
import type { AppRole } from './auth'
import {
  devPrelaunchOffsetMs,
  hasPrelaunchExemptRole,
  isMissingRpcError,
  parsePrelaunchGate,
  prelaunchWaitMs,
  type PrelaunchCheck,
} from './prelaunch'
import { supabase } from './supabase'

/** setTimeout holds at most ~24.8 days. */
const MAX_TIMER_MS = 2_147_483_647

/** Read once at load: the app rewrites the URL later. Always 0 in production builds. */
const DEV_OFFSET_MS =
  typeof window === 'undefined' ? 0 : devPrelaunchOffsetMs(window.location.search, Date.now())

async function fetchPrelaunchCheck(): Promise<PrelaunchCheck> {
  const startedMs = Date.now()
  const { data, error } = await supabase.rpc('prelaunch_gate')
  if (error) return isMissingRpcError(error) ? { kind: 'not_installed' } : { kind: 'unavailable' }
  return parsePrelaunchGate(data, (startedMs + Date.now()) / 2)
}

export type PrelaunchGateState = 'checking' | 'blocked' | 'open'

/**
 * `userId` null = nobody to gate (signed out, or still choosing a password).
 * Opens by itself at launch, on the server's clock, without a reload.
 */
export function usePrelaunchGate(
  userId: string | null,
  roles: readonly AppRole[],
): PrelaunchGateState {
  const exemptByRole = hasPrelaunchExemptRole(roles)
  const [check, setCheck] = useState<{ userId: string; value: PrelaunchCheck } | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!userId || exemptByRole) return
    let active = true
    void fetchPrelaunchCheck().then((value) => {
      if (!active) return
      setCheck({ userId, value })
      setNowMs(Date.now())
    })
    return () => {
      active = false
    }
  }, [userId, exemptByRole])

  const current = userId && check?.userId === userId ? check.value : null
  const waitMs =
    !userId || exemptByRole || !current ? null : prelaunchWaitMs(current, roles, nowMs, DEV_OFFSET_MS)

  useEffect(() => {
    if (waitMs == null) return
    const timer = window.setTimeout(() => setNowMs(Date.now()), Math.min(waitMs, MAX_TIMER_MS))
    // Background tabs throttle timers; re-check when the tab comes back.
    const onVisible = () => {
      if (!document.hidden) setNowMs(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [waitMs])

  if (!userId || exemptByRole) return 'open'
  if (!current) return 'checking'
  return waitMs == null ? 'open' : 'blocked'
}
