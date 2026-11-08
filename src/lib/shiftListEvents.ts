/**
 * Events that belong to one shift, one row per event id.
 * A single embedded object is still that one event.
 * Sharing a type or a police number does not collapse two events into one.
 */
export function listShiftEvents<T extends { id: string }>(
  born: readonly T[] | T | null | undefined,
): T[] {
  if (born == null) return []
  const rows = Array.isArray(born) ? born : [born]
  const seen = new Set<string>()
  const events: T[] = []
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    events.push(row)
  }
  return events
}

export function shiftEventCount(
  born: readonly { id: string }[] | { id: string } | null | undefined,
): number {
  return listShiftEvents(born).length
}

/** Hover and captions. Exactly one event reads אירוע אחד. */
export function shiftEventCountLabel(count: number): string {
  if (count === 1) return 'אירוע אחד'
  return `${count} אירועים`
}

/**
 * The shifts list opens the shift page and keeps every child event.
 * It does not open one event and leave the others behind.
 */
export function shiftListDestination(
  born: readonly { id: string }[] | { id: string } | null | undefined,
): { kind: 'shift'; eventIds: string[] } {
  return { kind: 'shift', eventIds: listShiftEvents(born).map((event) => event.id) }
}
