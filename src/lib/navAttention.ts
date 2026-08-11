import type { ParticipationStatus } from './status'
import { jerusalemToday } from './shifts'
import { supabase } from './supabase'

export type NavAttention = {
  mineEvents: boolean
  myShifts: boolean
}

type ParticipationRow = { status: ParticipationStatus }

type ShiftAttentionRow = {
  shift_date: string
  odometer_start: number | null
  odometer_end: number | null
}

/** True when the viewer still has event participations to complete. */
export function hasOpenMineEvents(participations: ParticipationRow[]): boolean {
  return participations.some((row) => row.status !== 'done')
}

/** True when an assigned, editable shift is missing odometer start or end. */
export function hasOpenMineShifts(
  shifts: ShiftAttentionRow[],
  today: string = jerusalemToday(),
): boolean {
  return shifts.some(
    (shift) =>
      shift.shift_date <= today &&
      (shift.odometer_start == null || shift.odometer_end == null),
  )
}

/** Appended to nav labels for screen readers when a red attention dot is shown. */
export function navAttentionAriaSuffix(attention: boolean): string {
  return attention ? ' — יש פריטים להשלמה' : ''
}

/** Lightweight flags for sidebar / tab-bar attention dots. */
export async function fetchNavAttention(userId: string): Promise<NavAttention> {
  const [eventsResult, shiftsResult] = await Promise.all([
    supabase.from('event_responders').select('status').eq('responder_id', userId),
    supabase
      .from('shift_responders')
      .select('shift:shifts(shift_date, odometer_start, odometer_end)')
      .eq('responder_id', userId),
  ])

  if (eventsResult.error) throw new Error(eventsResult.error.message)
  if (shiftsResult.error) throw new Error(shiftsResult.error.message)

  const participations = (eventsResult.data ?? []) as ParticipationRow[]
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
  }
}
