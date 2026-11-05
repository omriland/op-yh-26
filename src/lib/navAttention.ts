import type { ParticipationStatus, ShiftStatus } from './status'
import { isShiftPendingLog, jerusalemToday } from './shifts'
import { supabase } from './supabase'
import { hasOpenUserFeedback } from './userFeedback'
import { eventReleasedToResponders } from './eventResponderRelease'

export type NavAttention = {
  mineEvents: boolean
  myShifts: boolean
  openFeedback: boolean
}

type ParticipationRow = {
  status: ParticipationStatus
  origin?: string | null
  policeEventId?: string | null
  patrolCallsignNumber?: string | null
  patrolCallsignPrefix?: string | null
  patrolCallsign?: string | null
  roadId?: string | null
  /** Shift date for a shift-born event (else its event date). */
  documentDate?: string | null
}

type ShiftAttentionRow = {
  shift_date: string
  status?: ShiftStatus
  odometer_start?: number | null
  odometer_end?: number | null
}

/** True when the viewer still has event participations to complete. */
export function hasOpenMineEvents(
  participations: ParticipationRow[],
  today: string = jerusalemToday(),
): boolean {
  return participations.some(
    (row) =>
      row.status !== 'done' &&
      // A shift-born event is not the crew's to document before its shift date.
      !(row.origin === 'shift' && row.documentDate && row.documentDate > today) &&
      eventReleasedToResponders({
        origin: row.origin,
        policeEventId: row.policeEventId,
        patrolCallsignNumber: row.patrolCallsignNumber,
        patrolCallsignPrefix: row.patrolCallsignPrefix,
        patrolCallsign: row.patrolCallsign,
        roadId: row.roadId,
      }),
  )
}

/** True when an assigned, editable shift is not fully logged. */
export function hasOpenMineShifts(
  shifts: ShiftAttentionRow[],
  today: string = jerusalemToday(),
): boolean {
  return shifts.some((shift) => isShiftPendingLog(shift, today))
}

/** Appended to nav labels for screen readers when a red attention dot is shown. */
export function navAttentionAriaSuffix(attention: boolean): string {
  return attention ? ' — יש פריטים להשלמה' : ''
}

/** Lightweight flags for sidebar / tab-bar attention dots. */
export async function fetchNavAttention(
  userId: string,
  options: { feedbackInbox?: boolean } = {},
): Promise<NavAttention> {
  const [eventsResult, shiftsResult, openFeedback] = await Promise.all([
    supabase
      .from('event_responders')
      .select(
        'status, event:events!inner(police_event_id, origin, patrol_callsign, patrol_callsign_prefix, patrol_callsign_number, road_id, event_date, shift:shifts!events_shift_id_fkey(shift_date))',
      )
      .eq('responder_id', userId),
    supabase
      .from('shift_responders')
      .select('shift:shifts(shift_date, status, odometer_start, odometer_end)')
      .eq('responder_id', userId),
    options.feedbackInbox ? hasOpenUserFeedback(userId) : Promise.resolve(false),
  ])

  if (eventsResult.error) throw new Error(eventsResult.error.message)
  if (shiftsResult.error) throw new Error(shiftsResult.error.message)

  const participations = (eventsResult.data ?? []).map((row) => {
    const eventRaw = (row as {
      event?: {
        police_event_id?: string | null
        origin?: string | null
        patrol_callsign?: string | null
        patrol_callsign_prefix?: string | null
        patrol_callsign_number?: string | null
        road_id?: string | null
        event_date?: string | null
        shift?: { shift_date: string } | { shift_date: string }[] | null
      } | {
        police_event_id?: string | null
        origin?: string | null
        patrol_callsign?: string | null
        patrol_callsign_prefix?: string | null
        patrol_callsign_number?: string | null
        road_id?: string | null
        event_date?: string | null
        shift?: { shift_date: string } | { shift_date: string }[] | null
      }[]
    }).event
    const event = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw
    const shift = Array.isArray(event?.shift) ? event?.shift[0] : event?.shift
    return {
      status: (row as ParticipationRow).status,
      origin: event?.origin ?? null,
      policeEventId: event?.police_event_id ?? null,
      patrolCallsign: event?.patrol_callsign ?? null,
      patrolCallsignPrefix: event?.patrol_callsign_prefix ?? null,
      patrolCallsignNumber: event?.patrol_callsign_number ?? null,
      roadId: event?.road_id ?? null,
      documentDate: shift?.shift_date ?? event?.event_date ?? null,
    }
  })
  const shifts = (shiftsResult.data ?? [])
    .map((row) => {
      const shift = row.shift as ShiftAttentionRow | ShiftAttentionRow[] | null
      if (!shift) return null
      return Array.isArray(shift) ? (shift[0] ?? null) : shift
    })
    .filter((row): row is ShiftAttentionRow => row != null)

  return {
    mineEvents: hasOpenMineEvents(participations),
    myShifts: hasOpenMineShifts(shifts),
    openFeedback,
  }
}
