export type FreezeReason = 'over_60km' | 'suspicious_duplicate'

/**
 * Freeze flags. They live on `event_responders` (the truth for fuel refunds)
 * and on `events` as the "at least one frozen participation" aggregate.
 *
 * Both are optional because selects that predate the freeze columns (and rows
 * fetched with a narrower projection) simply omit them; every reader here
 * treats absent as "not frozen".
 */
export type EventFreezeFlags = {
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
}

export type FreezeMatchInput = {
  matchesOver60km: boolean
  matchesSuspiciousDuplicate: boolean
  approvedOver60km: boolean
  approvedSuspiciousDuplicate: boolean
}

/** Same formula the database stores on `event_responders.frozen_*`. */
export function computeFreezeFlags(input: FreezeMatchInput): EventFreezeFlags {
  return {
    frozen_over_60km: input.matchesOver60km && !input.approvedOver60km,
    frozen_suspicious_duplicate: input.matchesSuspiciousDuplicate && !input.approvedSuspiciousDuplicate,
  }
}

export function isEventFrozen(
  flags: EventFreezeFlags | null | undefined,
): boolean {
  return Boolean(flags?.frozen_over_60km || flags?.frozen_suspicious_duplicate)
}

/**
 * Refunds are per participation: a teammate frozen on the same event does not
 * hold back this responder's kilometers.
 */
export function participationCountsTowardFuelRefund(
  flags: EventFreezeFlags | null | undefined,
): boolean {
  return !isEventFrozen(flags)
}

/**
 * A participation carries its own flags once
 * `20260910140000_responder_level_event_freeze.sql` has run. Until then only the
 * event aggregate exists, and holding the whole event back is the safe side of
 * that gap — it is what production did before the per-responder split.
 */
export function participationFrozen(
  participation: EventFreezeFlags | null | undefined,
  event: EventFreezeFlags | null | undefined,
): boolean {
  return Boolean(
    (participation?.frozen_over_60km ?? event?.frozen_over_60km) ||
      (participation?.frozen_suspicious_duplicate ?? event?.frozen_suspicious_duplicate),
  )
}

/**
 * Kilometre value at or above which the database freezes the participation
 * pending admin approval. Mirrored here so the lead can be told at the moment
 * of typing rather than discovering it in a quarterly refund report.
 */
export const FREEZE_OVER_KM_THRESHOLD = 80

export const FREEZE_OVER_KM_HINT =
  `מעל ${FREEZE_OVER_KM_THRESHOLD} ק״מ — הדיווח של המתנדב ימתין לאישור מנהל לפני שייכלל בהחזר הדלק.`

/** The hint for a km value as typed, or undefined when it is below the threshold. */
export function over60kmHint(totalKm: string): string | undefined {
  const value = Number(totalKm.trim())
  if (!Number.isFinite(value)) return undefined
  return value >= FREEZE_OVER_KM_THRESHOLD ? FREEZE_OVER_KM_HINT : undefined
}

/** True when a current over-threshold responder was not part of the last approval snapshot. */
export function hasPendingOver60km(
  over60ResponderIds: readonly string[],
  approvedResponderIds: readonly string[] = [],
): boolean {
  const approved = new Set(approvedResponderIds)
  return over60ResponderIds.some((id) => !approved.has(id))
}

/**
 * Whose freeze the reader is looking at.
 *
 * `event` — an admin on an event where at least one participation is frozen.
 * `participation` — an admin on one volunteer's record inside that event.
 * `mine` — a responder on their own frozen record.
 */
export type FreezeScope = 'event' | 'participation' | 'mine'

const KM_REASON = `חריגת קילומטרים (מעל ${FREEZE_OVER_KM_THRESHOLD} ק״מ)`
const DUPLICATE_REASON = 'חשד לאירוע כפול'

function freezeReasonsHe(flags: EventFreezeFlags | null | undefined): string | null {
  const over60 = Boolean(flags?.frozen_over_60km)
  const duplicate = Boolean(flags?.frozen_suspicious_duplicate)
  if (over60 && duplicate) return `${KM_REASON} ובגלל ${DUPLICATE_REASON}`
  if (over60) return KM_REASON
  if (duplicate) return DUPLICATE_REASON
  return null
}

/** Tooltip on a fuel-report snowflake: how many of this volunteer's events are frozen. */
export function frozenEventCountTooltipHe(count: number): string | null {
  if (count <= 0) return null
  if (count === 1) return 'יש אירוע הקפאה אחד'
  return `יש ${count} אירועי הקפאה`
}

export const FUEL_FREEZE_SAVE_CONFIRM_TITLE = 'שמירה למרות אירועים קפואים'

export const FUEL_FREEZE_EXCLUDED_NOTICE =
  'לחלק מהמתנדבים יש אירועי הקפאה שלא ייכללו בחישוב ההחזר.'

export const FUEL_FREEZE_SAVE_CONFIRM_BODY = `${FUEL_FREEZE_EXCLUDED_NOTICE} לשמור בכל זאת?`

export const FUEL_FREEZE_SAVE_CONFIRM_LABEL = 'שמירה בכל זאת'

export function frozenFuelEventTotals(
  rows: readonly { frozen_event_count: number }[],
): { responderCount: number; eventCount: number } {
  let responderCount = 0
  let eventCount = 0
  for (const row of rows) {
    if (row.frozen_event_count <= 0) continue
    responderCount += 1
    eventCount += row.frozen_event_count
  }
  return { responderCount, eventCount }
}

export function freezeTooltipHe(
  flags: EventFreezeFlags | null | undefined,
  scope: FreezeScope = 'event',
): string | null {
  const reasons = freezeReasonsHe(flags)
  if (!reasons) return null

  if (scope === 'event') return `באירוע קיימת הקפאה בגלל ${reasons}, הממתינה לאישור מנהל.`
  const subject = scope === 'mine' ? 'הדיווח שלך' : 'הדיווח'
  return `${subject} מוקפא בגלל ${reasons} וממתין לאישור מנהל.`
}

/**
 * Compact, always-visible freeze line for cards and rows.
 *
 * The full sentence lives in `freezeTooltipHe`, but a frozen participation is
 * excluded from the quarterly fuel refund, so the reason cannot depend on a
 * pointer the field device does not have. Kept to one line, official register,
 * no exclamation.
 */
export function freezeNoticeHe(
  flags: EventFreezeFlags | null | undefined,
  scope: FreezeScope = 'event',
): string | null {
  const over60 = Boolean(flags?.frozen_over_60km)
  const duplicate = Boolean(flags?.frozen_suspicious_duplicate)
  const subject = scope === 'mine' ? 'הדיווח שלך מוקפא' : 'מוקפא'

  if (over60 && duplicate) return `${subject} · חריגת ק״מ וחשד לכפילות · ממתין לאישור מנהל`
  if (over60) return `${subject} · חריגת ק״מ · ממתין לאישור מנהל`
  if (duplicate) return `${subject} · ${DUPLICATE_REASON} · ממתין לאישור מנהל`
  return null
}

export function eventFreezeFlagsFromRow(row: {
  frozen_over_60km?: boolean | null
  frozen_suspicious_duplicate?: boolean | null
}): EventFreezeFlags {
  return {
    frozen_over_60km: Boolean(row.frozen_over_60km),
    frozen_suspicious_duplicate: Boolean(row.frozen_suspicious_duplicate),
  }
}

/** A participation row as far as freeze display is concerned. */
export type ResponderFreezeRow = EventFreezeFlags & {
  responder_id: string
}

/** An event row plus, when the projection has it, its participations. */
export type FreezeSource = EventFreezeFlags & {
  responders?: readonly ResponderFreezeRow[] | null
}

export type FreezeViewer = {
  userId?: string | null
  /** `admin` or `super_admin`. Shift-leads are never freeze readers. */
  isAdmin: boolean
}

export type FreezeView = {
  flags: EventFreezeFlags
  scope: FreezeScope
}

/** `admin` / `super_admin` see freezes across the unit; `shift_lead` does not. */
export function isFreezeAdminRole(roles: readonly string[]): boolean {
  return roles.includes('admin') || roles.includes('super_admin')
}

export function responderFreezeFlags(
  userId: string | null | undefined,
  responders: readonly ResponderFreezeRow[] | null | undefined,
): EventFreezeFlags | null {
  if (!userId || !responders) return null
  const mine = responders.find((row) => row.responder_id === userId)
  return mine ? eventFreezeFlagsFromRow(mine) : null
}

/**
 * What this reader may see on an event, or null for no mark at all.
 *
 * Admins see the event aggregate — one frozen participation is enough, since
 * they are the ones who approve it. Everyone else sees only their own frozen
 * participation: a shift-lead has no business reading a volunteer's pending
 * exception, and a teammate's freeze is not the reader's record. Without the
 * participations in the projection a non-admin gets nothing rather than
 * falling back to the event aggregate.
 */
export function freezeViewFor(
  viewer: FreezeViewer | null | undefined,
  source: FreezeSource | null | undefined,
): FreezeView | null {
  if (!viewer || !source) return null

  if (viewer.isAdmin) {
    const rows = source.responders ?? []
    const flags: EventFreezeFlags = {
      frozen_over_60km:
        Boolean(source.frozen_over_60km) || rows.some((row) => row.frozen_over_60km),
      frozen_suspicious_duplicate:
        Boolean(source.frozen_suspicious_duplicate) ||
        rows.some((row) => row.frozen_suspicious_duplicate),
    }
    return isEventFrozen(flags) ? { flags, scope: 'event' } : null
  }

  const mine = responderFreezeFlags(viewer.userId, source.responders)
  return mine && isEventFrozen(mine) ? { flags: mine, scope: 'mine' } : null
}

/**
 * One volunteer's record inside an event (the responder sections on event
 * detail). The owner sees their own freeze; an admin sees whose record it is;
 * a shift-lead and other volunteers see nothing.
 */
export function participationFreezeView(
  viewer: FreezeViewer | null | undefined,
  responder: ResponderFreezeRow | null | undefined,
): FreezeView | null {
  if (!viewer || !responder) return null
  const flags = eventFreezeFlagsFromRow(responder)
  if (!isEventFrozen(flags)) return null
  if (viewer.userId && viewer.userId === responder.responder_id) {
    return { flags, scope: 'mine' }
  }
  return viewer.isAdmin ? { flags, scope: 'participation' } : null
}
