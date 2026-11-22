import { useCallback, useEffect, useState } from 'react'
import { CREW_GRACE_HOURS, type ShiftPhase } from './shiftWindow'
import { SHIFT_KIND_LABELS, type ShiftKind } from './shifts'
import { supabase } from './supabase'

export type CurrentShift = {
  id: string
  shift_kind: ShiftKind
  shift_date: string
  starts_at: string
  ends_at: string
  vehicle_type: string
}

export const NEW_EVENT_PRIMARY_TYPES = ['תאונה', 'תקוע', 'נטוש', 'הפוך'] as const

const HOUR_MS = 60 * 60 * 1000

const END_TIME_FORMAT = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatEndTime(endsAt: string): string {
  return END_TIME_FORMAT.format(new Date(endsAt))
}

function hoursLeftToDocument(endsAt: string, now: Date): number {
  const closesAtMs = new Date(endsAt).getTime() + CREW_GRACE_HOURS * HOUR_MS
  return Math.ceil((closesAtMs - now.getTime()) / HOUR_MS)
}

export function barText(shift: CurrentShift, phase: ShiftPhase, now: Date): string {
  if (phase === 'finishing') {
    return `המשמרת הסתיימה, אפשר להשלים תיעוד · עוד ${hoursLeftToDocument(shift.ends_at, now)} שעות`
  }
  return `במשמרת ${SHIFT_KIND_LABELS[shift.shift_kind]} עכשיו · עד ${formatEndTime(shift.ends_at)}`
}

export function shouldOpenShiftScreen(input: {
  phase: ShiftPhase
  alreadyOpened: boolean
}): boolean {
  return input.phase === 'active' && !input.alreadyOpened
}

export function showBar(input: {
  phase: ShiftPhase
  onShiftScreenOfThisShift: boolean
}): boolean {
  const isOpenPhase = input.phase === 'active' || input.phase === 'finishing'
  return isOpenPhase && !input.onShiftScreenOfThisShift
}

export function canDeleteShiftEvent(input: {
  canManage: boolean
  phase: ShiftPhase
  empty: boolean
  done: boolean
}): boolean {
  if (input.canManage) return true
  const windowIsOpen = input.phase === 'active' || input.phase === 'finishing'
  return windowIsOpen && input.empty && !input.done
}

export function orderEventTypesForNewEvent<T extends { name: string }>(
  types: T[],
): { primary: T[]; more: T[] } {
  const primary: T[] = []
  for (const name of NEW_EVENT_PRIMARY_TYPES) {
    const match = types.find((type) => type.name === name)
    if (match) primary.push(match)
  }
  const more = types.filter((type) => !primary.includes(type))
  return { primary, more }
}

async function fetchCurrentShift(): Promise<CurrentShift | null> {
  const { data, error } = await supabase.rpc('my_current_shift')
  if (error) throw error
  const rows = (data ?? []) as CurrentShift[]
  return rows[0] ?? null
}

/** Loads the caller's live shift once, then again each time the window regains focus. */
export function useCurrentShift(): { shift: CurrentShift | null; reload: () => void } {
  const [shift, setShift] = useState<CurrentShift | null>(null)

  const reload = useCallback(() => {
    fetchCurrentShift()
      .then(setShift)
      .catch(() => {
        // Keep the last known shift: a failed refresh must not hide the bar.
      })
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [reload])

  return { shift, reload }
}
