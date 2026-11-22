export type ShiftPhase = 'legacy' | 'planned' | 'active' | 'finishing' | 'closed'

export const CREW_GRACE_HOURS = 48

const HOUR_MS = 60 * 60 * 1000

export type TimeRange = { start: Date; end: Date }

export function shiftWindowPhase(
  shift: { starts_at: string | null; ends_at: string | null },
  now: Date,
): ShiftPhase {
  if (!shift.starts_at || !shift.ends_at) return 'legacy'
  const startMs = new Date(shift.starts_at).getTime()
  const endMs = new Date(shift.ends_at).getTime()
  const nowMs = now.getTime()
  if (nowMs < startMs) return 'planned'
  if (nowMs < endMs) return 'active'
  if (nowMs < endMs + CREW_GRACE_HOURS * HOUR_MS) return 'finishing'
  return 'closed'
}

export function crewCanEdit(phase: ShiftPhase): boolean {
  return phase === 'active' || phase === 'finishing'
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end
}
