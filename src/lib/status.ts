/**
 * Canonical status vocabulary (05-rtl-language.md). Do not rephrase these labels.
 * Event-level stamps live in eventLifecycle.ts.
 */

export type EventStatus = 'draft' | 'in_progress' | 'partial' | 'done'
export type ParticipationStatus = 'pending' | 'in_progress' | 'done'
export type StampTone = 'done' | 'partial' | 'pending' | 'draft' | 'alert'

export type StampDescriptor = {
  label: string
  tone: StampTone
  /** תועד חלקית: how many of the assigned volunteers finished their log. */
  progress?: { done: number; total: number }
}

/**
 * Stored `events.status`, read as the nearest on-screen status. Only for places
 * that have the stored value and nothing else (the admin search status chip);
 * everything that has the event row uses `eventLifecycle` instead.
 */
const STORED_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'טיוטה',
  in_progress: 'ממתין למתנדב',
  partial: 'תועד חלקית',
  done: 'תועד',
}

export function storedStatusLabel(status: EventStatus): string {
  return STORED_STATUS_LABELS[status]
}

export type ParticipationNameSplit = {
  done: string[]
  draft: string[]
  pending: string[]
}

/** Split responders for status hover tip (completed / draft saved / waiting). */
export function splitRespondersByParticipation(
  responders: { status: ParticipationStatus; name: string }[],
): ParticipationNameSplit {
  const done: string[] = []
  const draft: string[] = []
  const pending: string[] = []
  for (const row of responders) {
    const name = row.name.trim() || 'מתנדב'
    if (row.status === 'done') done.push(name)
    else if (row.status === 'in_progress') draft.push(name)
    else pending.push(name)
  }
  return { done, draft, pending }
}

export function cancelledStamp(): StampDescriptor {
  return { label: 'בוטל', tone: 'draft' }
}

export function participationStamp(status: ParticipationStatus, isViewer: boolean): StampDescriptor {
  if (status === 'done') return { label: 'הושלם', tone: 'done' }
  if (status === 'in_progress' && isViewer) {
    return { label: 'טיוטה נשמרה', tone: 'draft' }
  }
  return { label: isViewer ? 'ממתין לתיעוד' : 'ממתין למתנדב', tone: 'pending' }
}

/** Responder finished fill; lead KM still missing. Replaces הושלם on their own stamp. */
export const FILL_DONE_AWAITING_KM_LABEL = 'סיימת לתעד'

/** Responder-facing: they finished; the lead has not entered KM yet. */
export const LEAD_KM_PENDING_NOTE = 'אחמ״ש טרם הזין ק״מ'

/** Responder-facing: they finished; the lead still owes end time (or other done-gate fields). */
export const AWAITING_LEAD_DETAILS_NOTE = 'ממתין לפרטים נוספים מאחמ״ש'

export function leadKmPendingNote(
  participation: ParticipationStatus | null | undefined,
  totalKm: number | null | undefined,
  origin?: 'manual' | 'shift' | null,
  missingLeadDetails?: boolean,
): string | null {
  // Shift-born docs are shared — lead-waiting notes are irrelevant.
  if (origin === 'shift') return null
  if (participation !== 'done') return null
  if (missingLeadDetails) return AWAITING_LEAD_DETAILS_NOTE
  if (totalKm != null) return null
  return LEAD_KM_PENDING_NOTE
}

/**
 * The viewer's own section (fill page, their card on event detail): סיימת לתעד
 * while the אחמ״ש still owes ק״מ or שעת סיום. The event's own stamp is
 * `lifecycleStamp`; this one only speaks for the viewer's part.
 */
export function mineParticipationStamp(
  status: ParticipationStatus | null | undefined,
  totalKm: number | null | undefined,
  options?: { missingLeadDetails?: boolean },
): StampDescriptor {
  const resolved = status ?? 'pending'
  if (resolved === 'done' && (options?.missingLeadDetails || totalKm == null)) {
    return { label: FILL_DONE_AWAITING_KM_LABEL, tone: 'done' }
  }
  return participationStamp(resolved, true)
}

/** Mine inbox: fill still open, or fill done but lead KM is missing. */
export function mineInboxIsOpen(
  participation: ParticipationStatus | null | undefined,
  totalKm: number | null | undefined,
): boolean {
  if (participation !== 'done') return true
  return totalKm == null
}

/** Mine-list / own-card CTA after draft save vs first open. */
export function mineFillCtaLabel(status: ParticipationStatus): string | null {
  if (status === 'done') return null
  if (status === 'in_progress') return 'המשך התיעוד'
  return 'השלמת התיעוד שלי'
}

export type ShiftStatus = 'draft' | 'in_progress' | 'closed'

const SHIFT_STAMPS: Record<ShiftStatus, StampDescriptor> = {
  in_progress: { label: 'פתוחה', tone: 'pending' },
  draft: { label: 'טיוטה', tone: 'draft' },
  closed: { label: 'נסגרה', tone: 'done' },
}

export const SHIFT_FILTERS: { value: ShiftStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'in_progress', label: 'פתוחה' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'closed', label: 'נסגרה' },
]

export function shiftStamp(status: ShiftStatus): StampDescriptor {
  return SHIFT_STAMPS[status]
}
