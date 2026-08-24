export type FreezeReason = 'over_60km' | 'suspicious_duplicate'

/**
 * Freeze flags as they arrive from `events`. Both are optional because list
 * selects that predate the freeze columns (and rows fetched with a narrower
 * projection) simply omit them; every reader here treats absent as "not frozen".
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

/** Same formula the database stores on `events.frozen_*`. */
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

export function eventCountsTowardFuelRefund(
  flags: EventFreezeFlags | null | undefined,
): boolean {
  return !isEventFrozen(flags)
}

/**
 * Kilometre value at or above which the database freezes the event pending admin
 * approval (`event_matches_over_60km`). Mirrored here so the lead can be told at the
 * moment of typing rather than discovering it in a quarterly refund report.
 */
export const FREEZE_OVER_KM_THRESHOLD = 60

export const FREEZE_OVER_KM_HINT =
  'מעל 60 ק״מ — האירוע ימתין לאישור מנהל לפני שייכלל בהחזר הדלק.'

/** The hint for a km value as typed, or undefined when it is below the threshold. */
export function over60kmHint(totalKm: string): string | undefined {
  const value = Number(totalKm.trim())
  if (!Number.isFinite(value)) return undefined
  return value >= FREEZE_OVER_KM_THRESHOLD ? FREEZE_OVER_KM_HINT : undefined
}

/** True when a current over-60km responder was not part of the last approval snapshot. */
export function hasPendingOver60km(
  over60ResponderIds: readonly string[],
  approvedResponderIds: readonly string[] = [],
): boolean {
  const approved = new Set(approvedResponderIds)
  return over60ResponderIds.some((id) => !approved.has(id))
}

export function freezeTooltipHe(
  flags: EventFreezeFlags | null | undefined,
): string | null {
  const over60 = Boolean(flags?.frozen_over_60km)
  const duplicate = Boolean(flags?.frozen_suspicious_duplicate)
  if (over60 && duplicate) {
    return 'האירוע מוקפא בגלל חריגת קילומטרים (מעל 60 ק״מ) ובגלל חשד לאירוע כפול, וממתין לאישור מנהל.'
  }
  if (over60) {
    return 'האירוע מוקפא בגלל חריגת קילומטרים (מעל 60 ק״מ) וממתין לאישור מנהל.'
  }
  if (duplicate) {
    return 'האירוע מוקפא בגלל חשד לאירוע כפול וממתין לאישור מנהל.'
  }
  return null
}

/**
 * Compact, always-visible freeze line for cards and rows.
 *
 * The full sentence lives in `freezeTooltipHe`, but a frozen event is excluded
 * from the quarterly fuel refund, so the reason cannot depend on a pointer the
 * field device does not have. Kept to one line, official register, no exclamation.
 */
export function freezeNoticeHe(
  flags: EventFreezeFlags | null | undefined,
): string | null {
  const over60 = Boolean(flags?.frozen_over_60km)
  const duplicate = Boolean(flags?.frozen_suspicious_duplicate)
  if (over60 && duplicate) {
    return 'מוקפא · חריגת ק״מ וחשד לכפילות · ממתין לאישור מנהל'
  }
  if (over60) {
    return 'מוקפא · חריגת ק״מ · ממתין לאישור מנהל'
  }
  if (duplicate) {
    return 'מוקפא · חשד לאירוע כפול · ממתין לאישור מנהל'
  }
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
