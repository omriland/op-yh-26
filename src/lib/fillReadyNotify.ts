type PreviousAssignment = { id: string; total_km?: number | null }
type NextAssignment = { assignmentId: string; totalKm?: number | null }

/** Pure helper: which assignment ids newly gained total_km (null → number). */
export function assignmentIdsNewlySetKm(
  previous: PreviousAssignment[],
  next: NextAssignment[],
): string[] {
  const prevById = new Map(previous.map((row) => [row.id, row.total_km ?? null]))
  const ids: string[] = []
  for (const row of next) {
    if (row.totalKm == null) continue
    const prev = prevById.get(row.assignmentId)
    // New insert: id was not in previous map → treat as newly set when km present.
    if (prev === undefined || prev == null) {
      ids.push(row.assignmentId)
    }
  }
  return ids
}

/** Brand-new assignment rows — fill is open as soon as the lead assigns, not after km. */
export function assignmentIdsNewlyAssigned(
  previous: PreviousAssignment[],
  next: NextAssignment[],
): string[] {
  const prevIds = new Set(previous.map((row) => row.id))
  return next
    .filter((row) => !prevIds.has(row.assignmentId))
    .map((row) => row.assignmentId)
}

/** Notify on first assignment, and still on first km for rows that were already assigned. */
export function fillReadyNotifyIds(
  previous: PreviousAssignment[],
  next: NextAssignment[],
): string[] {
  return [...new Set([
    ...assignmentIdsNewlyAssigned(previous, next),
    ...assignmentIdsNewlySetKm(previous, next),
  ])]
}
