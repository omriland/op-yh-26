/**
 * The status an event shows on screen, derived from the stored record.
 *
 * `events.status` (draft / in_progress / partial / done) stays what the database
 * gates on: responder edits, the done guard, fuel reports and the partner API all
 * read it. The lifecycle below is what people see, and it follows the order of the
 * work: the אחמ״ש builds the event (טיוטה), finishes their own fields (פרטים חסרים
 * until then), then the volunteers document (ממתין למתנדב, תועד חלקית, תועד).
 *
 * A כונן never sees טיוטה, and reads פרטים חסרים as ממתין למילוי פרטים. Every
 * other label is the same for both. Admins read the אחמ״ש labels.
 */

import type { EventListItem } from './events'
import { eventReleasedFromEvent, eventReleasedToResponders } from './eventResponderRelease'
import {
  gapFieldLabels,
  incompleteFieldLabels,
  missingEventFields,
  pendingResponderNames,
  type IncompleteCheckEvent,
  type IncompleteField,
} from './eventIncomplete'
import { shiftBornReportDone } from './shiftBornEvents'
import type { EventStatus, ParticipationStatus, StampDescriptor } from './status'

export type EventLifecycle = 'draft' | 'missing_details' | 'awaiting_responder' | 'partial' | 'done'

export type StatusAudience = 'lead' | 'responder'

export const EVENT_LIFECYCLE_ORDER: readonly EventLifecycle[] = [
  'draft',
  'missing_details',
  'awaiting_responder',
  'partial',
  'done',
]

/** The facts the lifecycle is read from, whatever screen they came from. */
export type LifecycleFacts = {
  origin: string | null | undefined
  storedStatus: EventStatus
  /** Event type, או״ק, כביש and מספר אירוע are filled (see eventResponderRelease). */
  released: boolean
  /** Lead-owned fields still empty: שלוחה, מיקום, שעות, ק״מ (and the release fields). */
  leadGaps: ReadonlySet<IncompleteField>
  responders: readonly { status: ParticipationStatus }[]
  /** Shift-born only: the crew report is done and has פירוט הטיפול. */
  shiftReportDone?: boolean
}

export type LifecycleState = {
  status: EventLifecycle
  /** Volunteers whose log is done. */
  done: number
  /** Volunteers assigned. */
  total: number
}

export function deriveEventLifecycle(facts: LifecycleFacts): LifecycleState {
  const total = facts.responders.length
  const done = facts.responders.filter((row) => row.status === 'done').length

  // Shift-born events are one shared report the crew writes; the אחמ״ש owes
  // nothing on them and they are visible to the crew from the start.
  if (facts.origin === 'shift') {
    return { status: facts.shiftReportDone ? 'done' : 'awaiting_responder', done, total }
  }

  if (total === 0) {
    // A cancelled event with nobody assigned is closed once שעת סיום is set,
    // which is the only way it is stored as done with no volunteers.
    return { status: facts.storedStatus === 'done' ? 'done' : 'draft', done, total }
  }
  if (!facts.released) return { status: 'draft', done, total }
  if (facts.leadGaps.size > 0) return { status: 'missing_details', done, total }
  if (done === 0) return { status: 'awaiting_responder', done, total }
  if (done < total) return { status: 'partial', done, total }
  return { status: 'done', done, total }
}

/** What `eventLifecycle` reads from a row: the gap fields plus each volunteer's status. */
export type LifecycleEvent = IncompleteCheckEvent & {
  status: EventStatus
  treatment_detail?: string | null
  responders: readonly (IncompleteCheckEvent['responders'][number] & {
    status: ParticipationStatus
  })[]
}

/** Lifecycle of a list, detail or cockpit row. */
export function eventLifecycle(
  event: LifecycleEvent,
): LifecycleState {
  return deriveEventLifecycle({
    origin: event.origin,
    storedStatus: event.status,
    released: eventReleasedFromEvent(event),
    leadGaps: missingEventFields(event),
    responders: event.responders,
    shiftReportDone: shiftBornReportDone(event),
  })
}

/** The fields keeping an event on פרטים חסרים, in the order the chips use. */
export function lifecycleMissingLabels(event: IncompleteCheckEvent): string[] {
  return incompleteFieldLabels(missingEventFields(event))
}

export const RESPONDER_CAN_LOG_WHILE_LEAD_FILLS = 'האחמ״ש עוד משלים פרטים באירוע. אפשר לתעד כבר עכשיו'

/**
 * Hover / tap text under a list or detail stamp. The אחמ״ש reads what is still
 * missing and who has not documented; a כונן reads only that they can go ahead.
 */
export function lifecycleStampTip(
  event: EventListItem,
  audience: StatusAudience,
  viewerId?: string | null,
): string | null {
  const state = eventLifecycle(event)
  if (audience === 'responder') {
    if (state.status !== 'missing_details') return null
    const own = event.responders.find((row) => row.responder_id === viewerId)
    return own && own.status !== 'done' ? RESPONDER_CAN_LOG_WHILE_LEAD_FILLS : null
  }
  const parts: string[] = []
  if (state.status === 'missing_details') {
    const fields = gapFieldLabels(event, missingEventFields(event))
    if (fields.length > 0) parts.push(`חסרים: ${fields.join(' · ')}`)
  }
  if (event.origin !== 'shift' && state.status !== 'draft' && state.status !== 'done') {
    const pending = pendingResponderNames(event)
    if (pending.length > 0) parts.push(`ממתין לתיעוד: ${pending.join(' · ')}`)
  }
  return parts.length > 0 ? parts.join('\n') : null
}

const LEAD_STAMPS: Record<EventLifecycle, StampDescriptor> = {
  draft: { label: 'טיוטה', tone: 'draft' },
  missing_details: { label: 'פרטים חסרים', tone: 'alert' },
  awaiting_responder: { label: 'ממתין למתנדב', tone: 'pending' },
  partial: { label: 'תועד חלקית', tone: 'partial' },
  done: { label: 'תועד', tone: 'done' },
}

/** The volunteer waits on the אחמ״ש here, so it is a waiting stamp, not an alert. */
const RESPONDER_MISSING_DETAILS: StampDescriptor = { label: 'ממתין למילוי פרטים', tone: 'pending' }

export function lifecycleStamp(
  state: EventLifecycle | LifecycleState,
  audience: StatusAudience,
): StampDescriptor {
  const status = typeof state === 'string' ? state : state.status
  const base =
    audience === 'responder' && status === 'missing_details'
      ? RESPONDER_MISSING_DETAILS
      : LEAD_STAMPS[status]
  if (typeof state !== 'string' && status === 'partial' && state.total > 0) {
    return { ...base, progress: { done: state.done, total: state.total } }
  }
  return { ...base }
}

export function lifecycleLabel(status: EventLifecycle, audience: StatusAudience): string {
  return lifecycleStamp(status, audience).label
}

/** אחמ״ש labels for admins, shift-leads and super admins; כונן labels for everyone else. */
export function statusAudienceForRoles(roles: readonly string[]): StatusAudience {
  return roles.some((role) => role === 'admin' || role === 'super_admin' || role === 'shift_lead')
    ? 'lead'
    : 'responder'
}

export type LifecycleFilterValue = EventLifecycle | 'all'

export type LifecycleFilterRow = { value: LifecycleFilterValue; label: string; tip?: string }

const LEAD_TIPS: Record<EventLifecycle, string> = {
  draft: 'בהזנה ע״י אחמ״ש. לא מוצג למתנדבים עד שיש מתנדב משובץ וסוג אירוע, או״ק, כביש ומספר אירוע מלאים',
  missing_details: 'מוצג למתנדבים, אבל חסרים פרטים מהאחמ״ש: שלוחה, מיקום, שעות או ק״מ',
  awaiting_responder: 'פרטי האחמ״ש מלאים. אף מתנדב עוד לא סיים לתעד',
  partial: 'חלק מהמתנדבים סיימו לתעד',
  done: 'כל המתנדבים תיעדו וכל פרטי האחמ״ש מלאים',
}

const RESPONDER_TIPS: Record<Exclude<EventLifecycle, 'draft'>, string> = {
  missing_details: 'האחמ״ש עוד משלים פרטים באירוע. אפשר לתעד כבר עכשיו',
  awaiting_responder: 'אף מתנדב עוד לא סיים לתעד',
  partial: 'חלק מהמתנדבים סיימו לתעד',
  done: 'כל המתנדבים תיעדו וכל פרטי האחמ״ש מלאים',
}

/**
 * Status menu rows. The אחמ״ש list opens on the work they owe; a כונן's list has
 * no טיוטה, because a draft never reaches a volunteer.
 */
export function lifecycleFilters(audience: StatusAudience): LifecycleFilterRow[] {
  const all: LifecycleFilterRow = { value: 'all', label: 'הכול' }
  if (audience === 'responder') {
    return [
      all,
      ...(['awaiting_responder', 'missing_details', 'partial', 'done'] as const).map((value) => ({
        value,
        label: lifecycleLabel(value, 'responder'),
        tip: RESPONDER_TIPS[value],
      })),
    ]
  }
  return [
    all,
    ...(['missing_details', 'awaiting_responder', 'partial', 'done', 'draft'] as const).map(
      (value) => ({ value, label: lifecycleLabel(value, 'lead'), tip: LEAD_TIPS[value] }),
    ),
  ]
}

const FILTER_VALUES: readonly LifecycleFilterValue[] = ['all', ...EVENT_LIFECYCLE_ORDER]

/**
 * Reads a stored status filter (session copy or saved view). Views saved before
 * this vocabulary hold `in_progress`, which meant "waiting for the volunteer".
 */
export function parseLifecycleFilter(raw: unknown): LifecycleFilterValue {
  if (raw === 'in_progress') return 'awaiting_responder'
  return FILTER_VALUES.includes(raw as LifecycleFilterValue) ? (raw as LifecycleFilterValue) : 'all'
}

/**
 * Stored statuses an event in this lifecycle can have. The server narrows by these,
 * then the page keeps exactly the lifecycle. Every set is a superset on purpose:
 * `events.status` is recomputed after each save, so it can trail by one write.
 */
export function storedStatusesForLifecycle(status: EventLifecycle): EventStatus[] | null {
  switch (status) {
    case 'draft':
      return null
    case 'missing_details':
      return ['in_progress', 'partial', 'done']
    case 'awaiting_responder':
      return ['draft', 'in_progress', 'partial']
    case 'partial':
      return ['in_progress', 'partial', 'done']
    case 'done':
      return ['partial', 'done']
  }
}

export function lifecycleMatches(filter: LifecycleFilterValue, event: LifecycleEvent): boolean {
  return filter === 'all' || eventLifecycle(event).status === filter
}

export type LifecycleFormFacts = {
  origin?: string | null
  storedStatus: EventStatus
  policeEventId: string
  hasEventType: boolean
  hasRoad: boolean
  patrolCallsign: string
  patrolCallsignPrefix: string
  patrolCallsignNumber: string
  hasDistrict: boolean
  location: string
  startTime: string
  endTime: string
  responders: readonly { status: ParticipationStatus; kmOwed: boolean }[]
}

/** The event form's header stamp, read from what is typed rather than what is saved. */
export function formLifecycle(facts: LifecycleFormFacts): LifecycleState {
  const gaps = new Set<IncompleteField>()
  if (!facts.policeEventId.trim()) gaps.add('police_event_id')
  if (!facts.hasDistrict) gaps.add('district')
  if (!facts.hasEventType) gaps.add('event_type')
  if (!facts.hasRoad) gaps.add('road')
  if (!facts.location.trim()) gaps.add('location')
  if (!facts.startTime.trim() || !facts.endTime.trim()) gaps.add('event_times')
  if (facts.responders.some((row) => row.kmOwed)) gaps.add('responder_km')
  const released = eventReleasedToResponders({
    origin: facts.origin,
    policeEventId: facts.policeEventId,
    hasEventType: facts.hasEventType,
    hasRoad: facts.hasRoad,
    patrolCallsign: facts.patrolCallsign,
    patrolCallsignPrefix: facts.patrolCallsignPrefix,
    patrolCallsignNumber: facts.patrolCallsignNumber,
  })
  return deriveEventLifecycle({
    origin: facts.origin,
    storedStatus: facts.storedStatus,
    released,
    leadGaps: gaps,
    responders: facts.responders,
  })
}
