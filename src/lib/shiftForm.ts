import { COUNT_DECREASE_BLOCKED, STALE_SAVE_MESSAGE } from './shiftBornEvents'
import { supabase } from './supabase'
import { deriveShiftLogStatus, eventToLogSnapshot } from './shiftLogStatus'
import type { EventStatus, ShiftStatus } from './status'
import type { ShiftKind, ShiftVehicleType } from './shifts'

export type ShiftFormDraft = {
  id?: string
  status: ShiftStatus
  shift_date: string
  shift_kind: ShiftKind
  vehicle_type: ShiftVehicleType
  personal_vehicle_id: string | null
  responder_ids: string[]
  event_ids: string[]
  odometer_start: number | null
  odometer_end: number | null
  total_km: number | null
  notes: string
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
  cancelled_count: number
  expected_updated_at?: string | null
}

export function computeTotalKm(
  odometerStart: number | null,
  odometerEnd: number | null,
): number | null {
  if (odometerStart == null || odometerEnd == null) return null
  // A reversed pair is a typo, not a distance. Refuse it rather than writing a
  // negative into `total_km`, which feeds the fuel-refund and km-exception reports.
  if (odometerEnd < odometerStart) return null
  return odometerEnd - odometerStart
}

export type LinkableEvent = {
  id: string
  event_date: string
  police_event_id: string | null
  event_type: { name: string } | null
}

export function suggestRollupsFromLinkedEvents(input: {
  eventTypeIds: (string | null)[]
  treated: { vehicle_kind_id: string; quantity: number }[]
  cancelledFlags?: boolean[]
}): {
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
  cancelled_count: number
} {
  const typeCounts = new Map<string, number>()
  for (const eventTypeId of input.eventTypeIds) {
    if (!eventTypeId) continue
    typeCounts.set(eventTypeId, (typeCounts.get(eventTypeId) ?? 0) + 1)
  }

  const vehicleCounts = new Map<string, number>()
  for (const row of input.treated) {
    vehicleCounts.set(
      row.vehicle_kind_id,
      (vehicleCounts.get(row.vehicle_kind_id) ?? 0) + row.quantity,
    )
  }

  const cancelled_count = (input.cancelledFlags ?? []).filter(Boolean).length

  return {
    event_type_counts: [...typeCounts.entries()].map(([event_type_id, count]) => ({
      event_type_id,
      count,
    })),
    treated_vehicle_counts: [...vehicleCounts.entries()].map(([vehicle_kind_id, count]) => ({
      vehicle_kind_id,
      count,
    })),
    cancelled_count,
  }
}

export const SHIFT_CREW_ERROR = 'יש לשבץ בין כונן אחד לשלושה'

/**
 * Deliberately permits an equal pair, unlike the event-fill rule, which demands
 * strictly greater. A shift whose vehicle never left base is a real zero-km shift;
 * only a reversed pair is wrong. The copy matches the rule it enforces.
 */
export const SHIFT_ODOMETER_ORDER_ERROR =
  'מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה'

export function shiftStatusFromDraft(
  draft: Pick<ShiftFormDraft, 'odometer_start' | 'odometer_end'>,
  events: Parameters<typeof deriveShiftLogStatus>[0]['events'] = [],
): ShiftStatus {
  return deriveShiftLogStatus({
    odometer_start: draft.odometer_start,
    odometer_end: draft.odometer_end,
    events,
  })
}

/** One-line summary for the form banner, naming whichever gate actually failed. */
export function summarizeShiftSaveErrors(fieldErrors: ShiftSaveError[]): string {
  if (fieldErrors.some((row) => row.field === 'odometer_end')) {
    return SHIFT_ODOMETER_ORDER_ERROR
  }
  if (fieldErrors.some((row) => row.field === 'responder_ids')) {
    return SHIFT_CREW_ERROR
  }
  return 'יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.'
}

export type ShiftSaveError = {
  field:
    | 'shift_date'
    | 'shift_kind'
    | 'vehicle_type'
    | 'personal_vehicle_id'
    | 'responder_ids'
    | 'odometer_end'
  message: string
}

/** Minimal save gate: date + shift kind + vehicle (plate when private). */
export function validateShiftSave(draft: ShiftFormDraft): ShiftSaveError[] {
  const errors: ShiftSaveError[] = []
  if (!draft.shift_date?.trim()) {
    errors.push({ field: 'shift_date', message: 'יש לבחור תאריך' })
  }
  if (!draft.shift_kind) {
    errors.push({ field: 'shift_kind', message: 'יש לבחור שם משמרת' })
  }
  if (!draft.vehicle_type) {
    errors.push({ field: 'vehicle_type', message: 'יש לבחור סוג רכב' })
  }
  if (draft.vehicle_type === 'personal' && !draft.personal_vehicle_id) {
    errors.push({ field: 'personal_vehicle_id', message: 'יש לבחור לוחית לרכב פרטי' })
  }
  if (draft.responder_ids.length < 1 || draft.responder_ids.length > 3) {
    errors.push({ field: 'responder_ids', message: SHIFT_CREW_ERROR })
  }
  if (
    draft.odometer_start != null &&
    draft.odometer_end != null &&
    draft.odometer_end < draft.odometer_start
  ) {
    errors.push({ field: 'odometer_end', message: SHIFT_ODOMETER_ORDER_ERROR })
  }
  return errors
}

export function shiftEventAlreadyLinkedMessage(policeEventId: string | null | undefined): string {
  const number = policeEventId?.trim()
  if (number) return `אירוע ${number} כבר מקושר למשמרת אחרת`
  return 'האירוע כבר מקושר למשמרת אחרת'
}

async function verifyPersonalVehicle(draft: ShiftFormDraft): Promise<string | null> {
  if (draft.vehicle_type !== 'personal' || !draft.personal_vehicle_id) return null

  const { data, error } = await supabase
    .from('vehicles')
    .select('user_id, archived')
    .eq('id', draft.personal_vehicle_id)
    .maybeSingle()

  if (error) {
    return 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.'
  }
  if (!data || !draft.responder_ids.includes(data.user_id as string)) {
    return 'הרכב הפרטי חייב להיות של כונן משובץ למשמרת'
  }
  if (data.archived) {
    return 'לא ניתן לשייך רכב בארכיון למשמרת חדשה'
  }
  return null
}

async function syncShiftResponders(
  shiftId: string,
  responderIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('shift_responders')
    .select('id, responder_id')
    .eq('shift_id', shiftId)

  if (existingError) {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const keepIds = new Set(responderIds)
  const toRemove = (existing ?? []).filter((row) => !keepIds.has(row.responder_id as string))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('shift_responders')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const existingResponderIds = new Set(
    (existing ?? []).map((row) => row.responder_id as string),
  )
  const toAdd = responderIds.filter((responderId) => !existingResponderIds.has(responderId))

  if (toAdd.length > 0) {
    const { error } = await supabase.from('shift_responders').insert(
      toAdd.map((responder_id) => ({
        shift_id: shiftId,
        responder_id,
      })),
    )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  return { ok: true }
}

async function syncEventTypeCounts(
  shiftId: string,
  counts: { event_type_id: string; count: number }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('shift_event_type_counts')
    .select('id, event_type_id')
    .eq('shift_id', shiftId)

  if (existingError) {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const keepTypeIds = new Set(counts.map((row) => row.event_type_id))
  const toRemove = (existing ?? []).filter(
    (row) => !keepTypeIds.has(row.event_type_id as string),
  )

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('shift_event_type_counts')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const existingByType = new Map(
    (existing ?? []).map((row) => [row.event_type_id as string, row.id as string]),
  )

  for (const row of counts) {
    const existingId = existingByType.get(row.event_type_id)
    if (existingId) {
      const { error } = await supabase
        .from('shift_event_type_counts')
        .update({ count: row.count })
        .eq('id', existingId)
      if (error) {
        return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    } else {
      const { error } = await supabase.from('shift_event_type_counts').insert({
        shift_id: shiftId,
        event_type_id: row.event_type_id,
        count: row.count,
      })
      if (error) {
        return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    }
  }

  return { ok: true }
}

const SHIFT_IDENTITY_FORBIDDEN = 'אין הרשאה לשנות פרטי משמרת'

export type ShiftUpdatePayload = {
  shift_date?: string
  shift_kind?: ShiftKind
  vehicle_type?: ShiftVehicleType
  personal_vehicle_id?: string | null
  odometer_start: number | null
  odometer_end: number | null
  total_km: number | null
  notes: string | null
  last_saved_by?: string
  updated_at: string
}

/** Build shift row update; omit identity columns when responder cannot edit them. */
export function buildShiftUpdatePayload(
  draft: ShiftFormDraft,
  options: { canEditIdentity: boolean },
): ShiftUpdatePayload {
  const body: ShiftUpdatePayload = {
    odometer_start: draft.odometer_start,
    odometer_end: draft.odometer_end,
    total_km: computeTotalKm(draft.odometer_start, draft.odometer_end),
    notes: draft.notes.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (!options.canEditIdentity) return body

  return {
    ...body,
    shift_date: draft.shift_date,
    shift_kind: draft.shift_kind,
    vehicle_type: draft.vehicle_type,
    personal_vehicle_id:
      draft.vehicle_type === 'personal' ? draft.personal_vehicle_id : null,
  }
}

function mapShiftUpdateError(error: { message?: string }): string {
  if (error.message?.includes(SHIFT_IDENTITY_FORBIDDEN)) {
    return SHIFT_IDENTITY_FORBIDDEN
  }
  if (error.message?.includes(STALE_SAVE_MESSAGE)) {
    return STALE_SAVE_MESSAGE
  }
  if (error.message?.includes(COUNT_DECREASE_BLOCKED)) {
    return COUNT_DECREASE_BLOCKED
  }
  return 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.'
}

export async function refreshShiftLogStatus(
  shiftId: string,
): Promise<ShiftStatus | null> {
  const [{ data: shift, error: shiftError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase
        .from('shifts')
        .select('odometer_start, odometer_end')
        .eq('id', shiftId)
        .maybeSingle(),
      supabase
        .from('events')
        .select(
          'status, police_event_id, treatment_detail, treatment_notes, road_id, location, treated:event_treated_vehicles(quantity)',
        )
        .eq('shift_id', shiftId)
        .eq('origin', 'shift'),
    ])

  if (shiftError || eventsError || !shift) return null

  const status = deriveShiftLogStatus({
    odometer_start: (shift.odometer_start as number | null) ?? null,
    odometer_end: (shift.odometer_end as number | null) ?? null,
    events: (events ?? []).map((row) =>
      eventToLogSnapshot({
        status: row.status as EventStatus,
        police_event_id: row.police_event_id as string | null,
        treatment_detail: row.treatment_detail as string | null,
        treatment_notes: row.treatment_notes as string | null,
        road_id: row.road_id as string | null,
        location: row.location as string | null,
        treated: row.treated as { quantity?: number }[] | null,
      }),
    ),
  })

  await supabase.from('shifts').update({ status }).eq('id', shiftId)
  return status
}

export async function saveShiftForm(
  draft: ShiftFormDraft,
  shiftLeadId: string,
  options?: {
    syncResponders?: boolean
    canEditIdentity?: boolean
  },
): Promise<
  | { ok: true; shiftId: string; status: ShiftStatus }
  | { ok: false; error: string; fieldErrors?: ShiftSaveError[] }
> {
  const fieldErrors = validateShiftSave(draft)
  if (fieldErrors.length > 0) {
    return {
      ok: false,
      // Name the actual blocker. A reversed odometer is not a missing-field problem,
      // and telling the user to fill in the date would send them to the wrong section.
      error: summarizeShiftSaveErrors(fieldErrors),
      fieldErrors,
    }
  }

  const canEditIdentity = options?.canEditIdentity ?? true

  if (canEditIdentity) {
    const personalVehicleError = await verifyPersonalVehicle(draft)
    if (personalVehicleError) {
      return {
        ok: false,
        error: personalVehicleError,
        fieldErrors:
          draft.vehicle_type === 'personal'
            ? [{ field: 'personal_vehicle_id', message: personalVehicleError }]
            : undefined,
      }
    }
  }

  let shiftId = draft.id
  const syncResponders = options?.syncResponders ?? true

  if (shiftId) {
    const shiftPayload = {
      ...buildShiftUpdatePayload(draft, { canEditIdentity }),
      last_saved_by: shiftLeadId,
    }
    let query = supabase.from('shifts').update(shiftPayload).eq('id', shiftId)
    if (draft.expected_updated_at) {
      query = query.eq('updated_at', draft.expected_updated_at)
    }
    const { data, error } = await query.select('id').maybeSingle()
    if (error) {
      return { ok: false, error: mapShiftUpdateError(error) }
    }
    if (!data) {
      return { ok: false, error: STALE_SAVE_MESSAGE }
    }
  } else {
    const shiftPayload = {
      ...buildShiftUpdatePayload(draft, { canEditIdentity: true }),
      last_saved_by: shiftLeadId,
    }
    const { data, error } = await supabase
      .from('shifts')
      .insert({ ...shiftPayload, shift_lead_id: shiftLeadId, status: 'in_progress' })
      .select('id')
      .single()

    if (error || !data) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
    shiftId = data.id as string
  }

  if (syncResponders) {
    const respondersSync = await syncShiftResponders(shiftId, draft.responder_ids)
    if (!respondersSync.ok) return respondersSync
  }

  const typeCountsSync = await syncEventTypeCounts(shiftId, draft.event_type_counts)
  if (!typeCountsSync.ok) return typeCountsSync

  const { error: syncError } = await supabase.rpc('sync_shift_born_events', {
    p_shift_id: shiftId,
  })
  if (syncError) {
    return { ok: false, error: mapShiftUpdateError(syncError) }
  }

  const status = (await refreshShiftLogStatus(shiftId)) ?? 'in_progress'
  return { ok: true, shiftId, status }
}

/** Admin-only delete (enforced by RLS). */
export async function deleteShift(
  shiftId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
  if (error) {
    return { ok: false, error: 'מחיקת המשמרת נכשלה. בדקו את ההרשאות ונסו שוב.' }
  }
  return { ok: true }
}

/** Recent events not already linked to another shift (optionally allow current shift's links). */
export async function loadLinkableEvents(excludeShiftId?: string): Promise<LinkableEvent[]> {
  const [{ data: linkedRows, error: linkedError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase.from('shift_events').select('event_id, shift_id'),
      supabase
        .from('events')
        .select('id, event_date, police_event_id, event_type:event_types(name)')
        .order('event_date', { ascending: false })
        .limit(200),
    ])

  if (linkedError) throw new Error(linkedError.message)
  if (eventsError) throw new Error(eventsError.message)

  const linkedEventIds = new Set(
    (linkedRows ?? [])
      .filter((row) => {
        const shiftId = row.shift_id as string
        return excludeShiftId == null || shiftId !== excludeShiftId
      })
      .map((row) => row.event_id as string),
  )
  return (events ?? []).filter((row) => !linkedEventIds.has(row.id as string)) as unknown as LinkableEvent[]
}

export async function refreshRollups(eventIds: string[]): Promise<{
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
  cancelled_count: number
}> {
  if (eventIds.length === 0) {
    return suggestRollupsFromLinkedEvents({ eventTypeIds: [], treated: [] })
  }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('event_type_id, is_cancelled')
    .in('id', eventIds)

  if (eventsError) throw new Error(eventsError.message)

  const eventTypeIds = (events ?? []).map((row) => row.event_type_id as string | null)
  const cancelledFlags = (events ?? []).map((row) => Boolean(row.is_cancelled))

  const { data: responders, error: respondersError } = await supabase
    .from('event_responders')
    .select('id')
    .in('event_id', eventIds)

  if (respondersError) throw new Error(respondersError.message)

  const responderIds = (responders ?? []).map((row) => row.id as string)
  let treated: { vehicle_kind_id: string; quantity: number }[] = []

  if (responderIds.length > 0) {
    const { data: treatedRows, error: treatedError } = await supabase
      .from('event_treated_vehicles')
      .select('vehicle_kind_id, quantity')
      .in('event_responder_id', responderIds)

    if (treatedError) throw new Error(treatedError.message)
    treated = (treatedRows ?? []) as { vehicle_kind_id: string; quantity: number }[]
  }

  return suggestRollupsFromLinkedEvents({ eventTypeIds, treated, cancelledFlags })
}
