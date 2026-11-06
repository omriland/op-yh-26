export type ShiftEventTypeCount = { event_type_id: string; count: number }

/**
 * Move one stored tally from the previous type to the next.
 * Counts for types that are neither side of the move stay as they are.
 * A missing previous row is left missing. The next type is inserted at 1
 * when the shift has no row for it yet. Counts do not go below 0.
 */
export function moveShiftEventTypeCount(
  counts: readonly ShiftEventTypeCount[],
  fromTypeId: string | null,
  toTypeId: string,
): ShiftEventTypeCount[] {
  if (!toTypeId || fromTypeId === toTypeId) {
    return counts.map((row) => ({ ...row }))
  }
  const next = counts.map((row) => ({ ...row }))
  if (fromTypeId) {
    const from = next.find((row) => row.event_type_id === fromTypeId)
    if (from) from.count = Math.max(0, from.count - 1)
  }
  const to = next.find((row) => row.event_type_id === toTypeId)
  if (to) to.count += 1
  else next.push({ event_type_id: toTypeId, count: 1 })
  return next
}

/**
 * Partial save for one shift-born event's type.
 * Equal values, including a blank that was already blank, write nothing —
 * the same rule as the event form, so unrelated columns are never nulled.
 */
export function shiftBornEventTypePatch(
  previousTypeId: string | null | undefined,
  nextTypeId: string,
): { event_type_id: string } | null {
  const next = nextTypeId.trim()
  if (!next || next === (previousTypeId ?? '')) return null
  return { event_type_id: next }
}

type TypedShiftEvent = {
  id: string
  event_type_id?: string | null
  event_type?: { name: string } | null
}

/**
 * Change one shift event's type and move that shift's stored type totals.
 * Every other event is returned unchanged.
 */
export function applyShiftEventTypeChange<T extends TypedShiftEvent>(input: {
  counts: readonly ShiftEventTypeCount[]
  events: readonly T[]
  eventId: string
  nextTypeId: string
}):
  | { ok: true; counts: ShiftEventTypeCount[]; events: T[] }
  | { ok: false; error: 'not_found' } {
  const target = input.events.find((event) => event.id === input.eventId)
  if (!target) return { ok: false, error: 'not_found' }
  const patch = shiftBornEventTypePatch(target.event_type_id, input.nextTypeId)
  const events = input.events.map((event) => ({ ...event }))
  if (!patch) {
    return {
      ok: true,
      counts: input.counts.map((row) => ({ ...row })),
      events,
    }
  }
  const changed = events.map((event): T =>
    event.id === input.eventId ? { ...event, event_type_id: patch.event_type_id } : event,
  )
  return {
    ok: true,
    counts: moveShiftEventTypeCount(
      input.counts,
      target.event_type_id ?? null,
      patch.event_type_id,
    ),
    events: changed,
  }
}

/**
 * Same as {@link applyShiftEventTypeChange}, and the chosen event's display
 * name follows the new type. Sibling events and their other fields stay.
 */
export function shiftEventsAfterTypeChange<T extends TypedShiftEvent>(input: {
  counts: readonly ShiftEventTypeCount[]
  events: readonly T[]
  eventId: string
  nextTypeId: string
  nextTypeName: string
}):
  | { ok: true; counts: ShiftEventTypeCount[]; events: T[] }
  | { ok: false; error: 'not_found' } {
  const result = applyShiftEventTypeChange(input)
  if (!result.ok) return result
  const name = input.nextTypeName.trim()
  return {
    ok: true,
    counts: result.counts,
    events: result.events.map((event): T =>
      event.id === input.eventId && name
        ? { ...event, event_type: { name } }
        : event,
    ),
  }
}
