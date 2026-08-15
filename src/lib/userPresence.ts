import { supabase } from './supabase'

export const PRESENCE_NOW_MS = 3 * 60 * 1000
export const PRESENCE_RECENT_MS = 15 * 60 * 1000
export const PRESENCE_TOUCH_THROTTLE_MS = 60 * 1000

export type PresenceStatus = 'now' | 'recent'

export type PresenceUserFlags = {
  active: boolean
  invite_pending: boolean
}

export type PresenceRow = {
  user_id: string
  last_active_at: string | null
}

export function presenceFromLastActive(
  lastActiveAt: string | null | undefined,
  nowMs: number,
  user: PresenceUserFlags,
): PresenceStatus | null {
  if (!user.active || user.invite_pending) return null
  if (!lastActiveAt) return null
  const then = Date.parse(lastActiveAt)
  if (Number.isNaN(then)) return null
  const elapsed = nowMs - then
  if (elapsed < 0 || elapsed <= PRESENCE_NOW_MS) return 'now'
  if (elapsed <= PRESENCE_RECENT_MS) return 'recent'
  return null
}

export function mergeLastActive<T extends { id: string }>(
  rows: T[],
  presenceRows: PresenceRow[],
): Array<T & { last_active_at: string | null }> {
  const byId = new Map(
    presenceRows.map((row) => [row.user_id, row.last_active_at]),
  )
  return rows.map((row) => ({
    ...row,
    last_active_at: byId.get(row.id) ?? null,
  }))
}

export function shouldTouchPresence(input: {
  impersonating: boolean
  hidden: boolean
  nowMs: number
  lastTouchAtMs: number | null
  inFlight: boolean
  throttleMs?: number
}): 'touch' | 'skip' {
  if (input.impersonating || input.hidden || input.inFlight) return 'skip'
  const throttleMs = input.throttleMs ?? PRESENCE_TOUCH_THROTTLE_MS
  if (input.lastTouchAtMs !== null && input.nowMs - input.lastTouchAtMs < throttleMs) {
    return 'skip'
  }
  return 'touch'
}

export type PresenceHeartbeatOptions = {
  isImpersonating: () => boolean
  isDocumentHidden: () => boolean
  now: () => number
  touch: () => Promise<unknown>
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) => void
  removeEventListener: (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) => void
  throttleMs?: number
}

export async function fetchAdminLastActive(): Promise<PresenceRow[]> {
  const { data, error } = await supabase.rpc('admin_list_last_active')
  if (error) return []
  return ((data ?? []) as PresenceRow[]).map((row) => ({
    user_id: row.user_id,
    last_active_at: row.last_active_at ?? null,
  }))
}

export async function touchLastActive(): Promise<void> {
  const { error } = await supabase.rpc('touch_last_active')
  if (error) throw error
}

export function createPresenceHeartbeat(
  opts: PresenceHeartbeatOptions,
): { stop: () => void } {
  let lastTouchAtMs: number | null = null
  let inFlight = false
  let stopped = false
  const throttleMs = opts.throttleMs ?? PRESENCE_TOUCH_THROTTLE_MS

  const tryTouch = () => {
    if (stopped) return
    if (
      shouldTouchPresence({
        impersonating: opts.isImpersonating(),
        hidden: opts.isDocumentHidden(),
        nowMs: opts.now(),
        lastTouchAtMs,
        inFlight,
        throttleMs,
      }) !== 'touch'
    ) {
      return
    }
    inFlight = true
    const startedAt = opts.now()
    void opts
      .touch()
      .then(() => {
        lastTouchAtMs = startedAt
      })
      .catch(() => {
        /* retry on the next action */
      })
      .finally(() => {
        inFlight = false
      })
  }

  const onAction: EventListener = () => {
    tryTouch()
  }
  const onVisibility: EventListener = () => {
    if (!opts.isDocumentHidden()) tryTouch()
  }

  opts.addEventListener('pointerdown', onAction, { capture: true })
  opts.addEventListener('keydown', onAction, { capture: true })
  opts.addEventListener('visibilitychange', onVisibility)

  return {
    stop() {
      stopped = true
      opts.removeEventListener('pointerdown', onAction, { capture: true })
      opts.removeEventListener('keydown', onAction, { capture: true })
      opts.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
