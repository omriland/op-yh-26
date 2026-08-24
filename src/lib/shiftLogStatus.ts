import { isShiftBornEventEmpty, type ShiftBornEventSnapshot } from './shiftBornEvents'
import type { EventStatus, ShiftStatus } from './status'

/**
 * Shift chips follow documentation, not the clock and not a start/close button.
 *
 *   פתוחה  — nothing logged yet
 *   טיוטה  — a responder started the shift or an event, but something is still open
 *   נסגרה  — both odometers are in, and every shift-born event is done
 *
 * Empty event slots the lead created do not count as logging. Stored DB value
 * `in_progress` is the open state (the enum predates this meaning).
 */
export function eventToLogSnapshot(event: {
  status: EventStatus
  police_event_id: string | null
  treatment_detail: string | null
  treatment_notes: string | null
  road_id?: string | null
  location?: string | null
  treated?: ReadonlyArray<{ quantity?: number | null }> | null
  treated_count?: number
}): ShiftBornEventSnapshot {
  const treated_count =
    event.treated_count ??
    (event.treated ?? []).reduce((sum, row) => sum + (row.quantity ?? 0), 0)
  return {
    status: event.status,
    police_event_id: event.police_event_id,
    treatment_detail: event.treatment_detail,
    treatment_notes: event.treatment_notes,
    road_id: event.road_id,
    location: event.location,
    treated_count,
  }
}

export function isShiftFullyLogged(
  odometerStart: number | null,
  odometerEnd: number | null,
): boolean {
  return odometerStart != null && odometerEnd != null
}

export function isShiftLogStarted(
  odometerStart: number | null,
  odometerEnd: number | null,
): boolean {
  return odometerStart != null || odometerEnd != null
}

export function isEventLogStarted(event: ShiftBornEventSnapshot): boolean {
  return event.status === 'done' || !isShiftBornEventEmpty(event)
}

export function deriveShiftLogStatus(input: {
  odometer_start: number | null
  odometer_end: number | null
  events: readonly ShiftBornEventSnapshot[]
}): ShiftStatus {
  const shiftDone = isShiftFullyLogged(input.odometer_start, input.odometer_end)
  const eventsDone = input.events.every((event) => event.status === 'done')
  if (shiftDone && eventsDone) return 'closed'

  const anyEventStarted = input.events.some(isEventLogStarted)
  if (shiftDone || isShiftLogStarted(input.odometer_start, input.odometer_end) || anyEventStarted) {
    return 'draft'
  }
  return 'in_progress'
}

export function shiftRecordLogStatus(shift: {
  odometer_start: number | null
  odometer_end: number | null
  born_events?: ReadonlyArray<{
    status: EventStatus
    police_event_id: string | null
    treatment_detail: string | null
    treatment_notes: string | null
    road_id?: string | null
    location?: string | null
    treated?: ReadonlyArray<{ quantity?: number | null }> | null
  }>
}): ShiftStatus {
  return deriveShiftLogStatus({
    odometer_start: shift.odometer_start,
    odometer_end: shift.odometer_end,
    events: (shift.born_events ?? []).map(eventToLogSnapshot),
  })
}
