/** Pure helper: which assignment ids newly gained total_km (null → number). */
export function assignmentIdsNewlySetKm(
  previous: { id: string; total_km: number | null }[],
  next: { assignmentId: string; totalKm: number | null }[],
): string[] {
  const prevById = new Map(previous.map((row) => [row.id, row.total_km]))
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
