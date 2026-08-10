/** Canonical status vocabulary — 05-rtl-language.md. Do not rephrase these labels. */

export type EventStatus = 'draft' | 'in_progress' | 'partial' | 'done'
export type ParticipationStatus = 'pending' | 'in_progress' | 'done'
export type StampTone = 'done' | 'partial' | 'pending' | 'draft'

export type StampDescriptor = { label: string; tone: StampTone }

const EVENT_STAMPS: Record<EventStatus, StampDescriptor> = {
  draft: { label: 'טיוטה', tone: 'draft' },
  in_progress: { label: 'בטיפול', tone: 'pending' },
  partial: { label: 'הושלם חלקית', tone: 'partial' },
  done: { label: 'הושלם', tone: 'done' },
}

export const EVENT_FILTERS: { value: EventStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'partial', label: 'הושלם חלקית' },
  { value: 'done', label: 'הושלם' },
  { value: 'draft', label: 'טיוטה' },
]

export function eventStamp(status: EventStatus): StampDescriptor {
  return EVENT_STAMPS[status]
}

export function participationStamp(status: ParticipationStatus, isViewer: boolean): StampDescriptor {
  if (status === 'done') return { label: 'הושלם', tone: 'done' }
  if (status === 'in_progress' && isViewer) {
    return { label: 'טיוטה נשמרה', tone: 'draft' }
  }
  return { label: isViewer ? 'ממתין למילוי פרטים' : 'ממתין לכונן', tone: 'pending' }
}

/** Mine-list / own-card CTA after draft save vs first open. */
export function mineFillCtaLabel(status: ParticipationStatus): string | null {
  if (status === 'done') return null
  if (status === 'in_progress') return 'המשך מילוי הפרטים'
  return 'השלמת הפרטים שלי'
}

/**
 * Viewer-relative stamp: an open participation of the viewer's own overrides the
 * event-level label, per screens/event-list.md.
 */
export function viewerStamp(
  status: EventStatus,
  ownParticipation: ParticipationStatus | null,
): StampDescriptor {
  if (ownParticipation === 'in_progress') {
    return { label: 'טיוטה נשמרה', tone: 'draft' }
  }
  if (ownParticipation && ownParticipation !== 'done') {
    return { label: 'ממתין למילוי פרטים', tone: 'pending' }
  }
  return eventStamp(status)
}

export type ShiftStatus = 'draft' | 'in_progress' | 'closed'

const SHIFT_STAMPS: Record<ShiftStatus, StampDescriptor> = {
  draft: { label: 'טיוטה', tone: 'draft' },
  in_progress: { label: 'במשמרת', tone: 'pending' },
  closed: { label: 'נסגרה', tone: 'done' },
}

export const SHIFT_FILTERS: { value: ShiftStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'in_progress', label: 'במשמרת' },
  { value: 'closed', label: 'נסגרה' },
  { value: 'draft', label: 'טיוטה' },
]

export function shiftStamp(status: ShiftStatus): StampDescriptor {
  return SHIFT_STAMPS[status]
}
