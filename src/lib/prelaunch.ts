import type { AppRole } from './auth'

/**
 * Pre-launch gate: until 2026-11-01 00:01 Asia/Jerusalem only admins, super
 * admins and the App Review demo account get past the "launches on 1.11"
 * screen. The database decides (public.prelaunch_launch_at() and
 * public.prelaunch_gate() in supabase/migrations/20261029180000_prelaunch_gate.sql),
 * on its own clock. This constant is the fallback when the server cannot be
 * asked; prelaunch.test.ts checks it matches the migration.
 */
export const PRELAUNCH_LAUNCH_AT = '2026-10-31T22:01:00Z'
export const PRELAUNCH_LAUNCH_AT_MS = Date.parse(PRELAUNCH_LAUNCH_AT)

export const PRELAUNCH_TITLE = 'המערכת תעלה לאוויר ב-1.11'
/** Shown as two lines. No hour on purpose: the date is what members need. */
export const PRELAUNCH_BODY_LINES = ['החשבון שלך מוכן.', 'הכניסה למערכת תיפתח ביום ראשון, 1 בנובמבר.'] as const

/**
 * Open the app this long after launch, so the database (which lifts RLS at
 * exactly launch) is ahead of a client whose clock offset is a little off.
 */
export const PRELAUNCH_OPEN_SLACK_MS = 5_000

/** Same roles as public.is_prelaunch_exempt. The demo flag is known only to the server. */
const EXEMPT_ROLES: readonly AppRole[] = ['admin', 'super_admin']

export function hasPrelaunchExemptRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => EXEMPT_ROLES.includes(role))
}

export type PrelaunchCheck =
  /** Server answered. `serverOffsetMs` = server clock minus client clock. */
  | { kind: 'server'; exempt: boolean; launchAtMs: number; serverOffsetMs: number }
  /** The RPC does not exist: gate not deployed yet, or rolled back. No gate. */
  | { kind: 'not_installed' }
  /** Network or server error: fall back to roles and the client clock. */
  | { kind: 'unavailable' }

/** `clientNowMs` = the client clock in the middle of the request. */
export function parsePrelaunchGate(data: unknown, clientNowMs: number): PrelaunchCheck {
  if (!data || typeof data !== 'object') return { kind: 'unavailable' }
  const row = data as Record<string, unknown>
  const serverNowMs = Number(row.server_now_ms)
  const launchAtMs = Number(row.launch_at_ms)
  if (typeof row.exempt !== 'boolean' || !Number.isFinite(serverNowMs) || !Number.isFinite(launchAtMs)) {
    return { kind: 'unavailable' }
  }
  return {
    kind: 'server',
    exempt: row.exempt,
    launchAtMs,
    serverOffsetMs: serverNowMs - clientNowMs,
  }
}

export function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || error.code === '42883' || /schema cache/i.test(error.message ?? '')
}

/**
 * Milliseconds until this user may enter, or null when they may enter now.
 * `devOffsetMs` (dev builds only) shifts the clock for screenshots and QA.
 */
export function prelaunchWaitMs(
  check: PrelaunchCheck,
  roles: readonly AppRole[],
  clientNowMs: number,
  devOffsetMs = 0,
): number | null {
  if (check.kind === 'not_installed') return null
  let exempt: boolean
  let launchAtMs: number
  let nowMs: number
  if (check.kind === 'server') {
    exempt = check.exempt
    launchAtMs = check.launchAtMs
    nowMs = clientNowMs + (devOffsetMs || check.serverOffsetMs)
  } else {
    exempt = hasPrelaunchExemptRole(roles)
    launchAtMs = PRELAUNCH_LAUNCH_AT_MS
    nowMs = clientNowMs + devOffsetMs
  }
  if (exempt) return null
  const openAtMs = launchAtMs + PRELAUNCH_OPEN_SLACK_MS
  return nowMs < openAtMs ? openAtMs - nowMs : null
}

/**
 * Dev only: `?prelaunch_now=2026-10-31T21:59:00Z` makes the web gate act as if
 * the clock read that time when the page loaded. It moves the web decision
 * only; the database keeps its own clock. Production builds drop it.
 */
export function devPrelaunchOffsetMs(search: string, clientNowMs: number): number {
  if (!import.meta.env.DEV) return 0
  const raw = new URLSearchParams(search).get('prelaunch_now')
  const pretendMs = raw ? Date.parse(raw) : Number.NaN
  return Number.isFinite(pretendMs) ? pretendMs - clientNowMs : 0
}
