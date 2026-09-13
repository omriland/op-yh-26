/** Canonical status vocabulary — 05-rtl-language.md. Do not rephrase these labels. */

export type EventStatus = 'draft' | 'in_progress' | 'partial' | 'done'
export type ParticipationStatus = 'pending' | 'in_progress' | 'done'
export type StampTone = 'done' | 'partial' | 'pending' | 'draft' | 'alert'
export type TrailPhase = 'past' | 'current' | 'future'

export type StampDescriptor = { label: string; tone: StampTone }

export type EventStatusTrailStep = StampDescriptor & {
  status: EventStatus
  phase: TrailPhase
}

export const EVENT_STATUS_ORDER: EventStatus[] = [
  'draft',
  'in_progress',
  'partial',
  'done',
]

const EVENT_STAMPS: Record<EventStatus, StampDescriptor> = {
  draft: { label: 'אירוע בהזנה', tone: 'draft' },
  in_progress: { label: 'ממתין לתיעוד', tone: 'pending' },
  partial: { label: 'תועד חלקית', tone: 'partial' },
  done: { label: 'הושלם', tone: 'done' },
}

export const EVENT_FILTERS: { value: EventStatus | 'all'; label: string; tip?: string }[] = [
  { value: 'all', label: 'הכול' },
  {
    value: 'in_progress',
    label: 'ממתין לתיעוד',
    tip: 'הוזן ע״י אחמ״ש וטרם תועד ע״י מתנדב',
  },
  {
    value: 'partial',
    label: 'תועד חלקית',
    // Not only a half-finished volunteer: an event where everyone documented
    // and the אחמ״ש still owes שעת סיום or ק״מ also lands here.
    tip: 'חלק מהתיעוד הושלם. ממתין למתנדבים נוספים או לשעת סיום וק״מ מהאחמ״ש',
  },
  { value: 'done', label: 'הושלם', tip: 'אירוע סגור שתועד במלואו' },
  {
    value: 'draft',
    label: 'אירוע בהזנה',
    tip: 'טיוטה נשמרה ע״י אחמ״ש. טרם זמין למתנדב לתיעוד',
  },
]

export function eventStamp(status: EventStatus): StampDescriptor {
  return EVENT_STAMPS[status]
}

/** Lead-facing last-step copy when documentation is `done` but responder KM is still missing. */
export const MISSING_KM_STAMP: StampDescriptor = { label: 'חסר ק״מ', tone: 'alert' }

/**
 * Viewer-relative documentation stamp for אחמ״ש lists.
 * Does not change event/participation status — only the lead-facing label.
 */
export function reportingDocumentationStamp(
  status: EventStatus,
  missingKm: boolean,
): StampDescriptor {
  return overlayMissingKmOnDoneStamp(eventStamp(status), missingKm)
}

/** Replace a green הושלם stamp when any responder KM is still missing. */
export function overlayMissingKmOnDoneStamp(
  stamp: StampDescriptor,
  missingKm: boolean,
): StampDescriptor {
  if (missingKm && stamp.tone === 'done' && stamp.label === 'הושלם') {
    return MISSING_KM_STAMP
  }
  return stamp
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

/** Full pipeline for the desktop Events table status column. */
export function eventStatusTrailSteps(
  status: EventStatus,
  options?: { missingKm?: boolean },
): EventStatusTrailStep[] {
  const currentIndex = EVENT_STATUS_ORDER.indexOf(status)
  const missingKm = options?.missingKm === true
  return EVENT_STATUS_ORDER.map((stepStatus, index) => {
    const phase: TrailPhase =
      index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future'
    const stamp =
      phase === 'current' && stepStatus === 'done' && missingKm
        ? MISSING_KM_STAMP
        : EVENT_STAMPS[stepStatus]
    return { status: stepStatus, label: stamp.label, tone: stamp.tone, phase }
  })
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

/** Own-row stamp for mine inbox / fill / detail: סיימת לתעד when lead KM is still null. */
export function mineParticipationStamp(
  status: ParticipationStatus | null | undefined,
  totalKm: number | null | undefined,
  options?: { missingLeadDetails?: boolean },
): StampDescriptor {
  const resolved = status ?? 'pending'
  if (resolved === 'done' && options?.missingLeadDetails) {
    return eventStamp('partial')
  }
  if (resolved === 'done' && totalKm == null) {
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

/**
 * Viewer-relative stamp: an open participation of the viewer's own overrides the
 * event-level label, per screens/event-list.md.
 */
export function viewerStamp(
  status: EventStatus,
  ownParticipation: ParticipationStatus | null,
  ownTotalKm?: number | null,
): StampDescriptor {
  if (ownParticipation === 'in_progress') {
    return { label: 'טיוטה נשמרה', tone: 'draft' }
  }
  if (ownParticipation && ownParticipation !== 'done') {
    return { label: 'ממתין לתיעוד', tone: 'pending' }
  }
  if (ownParticipation === 'done' && ownTotalKm == null) {
    return { label: FILL_DONE_AWAITING_KM_LABEL, tone: 'done' }
  }
  return eventStamp(status)
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
