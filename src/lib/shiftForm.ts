import { supabase } from './supabase'
import type { ShiftStatus } from './status'
import type { ShiftKind, ShiftVehicleType } from './shifts'

export type ShiftFormDraft = {
  id?: string
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
}

export function computeTotalKm(
  odometerStart: number | null,
  odometerEnd: number | null,
): number | null {
  if (odometerStart == null || odometerEnd == null) return null
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
}): {
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
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

  return {
    event_type_counts: [...typeCounts.entries()].map(([event_type_id, count]) => ({
      event_type_id,
      count,
    })),
    treated_vehicle_counts: [...vehicleCounts.entries()].map(([vehicle_kind_id, count]) => ({
      vehicle_kind_id,
      count,
    })),
  }
}

export type ShiftSaveError = {
  field: 'shift_date' | 'shift_kind' | 'vehicle_type' | 'personal_vehicle_id'
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
  return errors
}

function isShiftEventConflict(error: { code?: string }): boolean {
  return error.code === '23505'
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

async function syncShiftEvents(
  shiftId: string,
  eventIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('shift_events')
    .select('id, event_id')
    .eq('shift_id', shiftId)

  if (existingError) {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const keepIds = new Set(eventIds)
  const toRemove = (existing ?? []).filter((row) => !keepIds.has(row.event_id as string))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('shift_events')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const existingEventIds = new Set((existing ?? []).map((row) => row.event_id as string))
  const toAdd = eventIds.filter((eventId) => !existingEventIds.has(eventId))

  for (const eventId of toAdd) {
    const { error } = await supabase.from('shift_events').insert({
      shift_id: shiftId,
      event_id: eventId,
    })
    if (error) {
      if (isShiftEventConflict(error)) {
        return { ok: false, error: 'האירוע כבר מקושר למשמרת אחרת' }
      }
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

async function syncTreatedVehicleCounts(
  shiftId: string,
  counts: { vehicle_kind_id: string; count: number }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('shift_treated_vehicle_counts')
    .select('id, vehicle_kind_id')
    .eq('shift_id', shiftId)

  if (existingError) {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const keepKindIds = new Set(counts.map((row) => row.vehicle_kind_id))
  const toRemove = (existing ?? []).filter(
    (row) => !keepKindIds.has(row.vehicle_kind_id as string),
  )

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('shift_treated_vehicle_counts')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const existingByKind = new Map(
    (existing ?? []).map((row) => [row.vehicle_kind_id as string, row.id as string]),
  )

  for (const row of counts) {
    const existingId = existingByKind.get(row.vehicle_kind_id)
    if (existingId) {
      const { error } = await supabase
        .from('shift_treated_vehicle_counts')
        .update({ count: row.count })
        .eq('id', existingId)
      if (error) {
        return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    } else {
      const { error } = await supabase.from('shift_treated_vehicle_counts').insert({
        shift_id: shiftId,
        vehicle_kind_id: row.vehicle_kind_id,
        count: row.count,
      })
      if (error) {
        return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    }
  }

  return { ok: true }
}

export async function saveShiftForm(
  draft: ShiftFormDraft,
  shiftLeadId: string,
  options?: { syncResponders?: boolean },
): Promise<
  | { ok: true; shiftId: string; status: ShiftStatus }
  | { ok: false; error: string; fieldErrors?: ShiftSaveError[] }
> {
  const fieldErrors = validateShiftSave(draft)
  if (fieldErrors.length > 0) {
    return {
      ok: false,
      error: 'יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.',
      fieldErrors,
    }
  }

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

  const totalKm = computeTotalKm(draft.odometer_start, draft.odometer_end)

  const shiftPayload = {
    shift_date: draft.shift_date,
    shift_kind: draft.shift_kind,
    vehicle_type: draft.vehicle_type,
    personal_vehicle_id:
      draft.vehicle_type === 'personal' ? draft.personal_vehicle_id : null,
    odometer_start: draft.odometer_start,
    odometer_end: draft.odometer_end,
    total_km: totalKm,
    notes: draft.notes.trim() || null,
    updated_at: new Date().toISOString(),
  }

  let shiftId = draft.id
  const nextStatus: ShiftStatus = 'draft'
  const syncResponders = options?.syncResponders ?? true

  if (shiftId) {
    const { error } = await supabase.from('shifts').update(shiftPayload).eq('id', shiftId)
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  } else {
    const { data, error } = await supabase
      .from('shifts')
      .insert({ ...shiftPayload, shift_lead_id: shiftLeadId, status: nextStatus })
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

  const eventsSync = await syncShiftEvents(shiftId, draft.event_ids)
  if (!eventsSync.ok) return eventsSync

  const typeCountsSync = await syncEventTypeCounts(shiftId, draft.event_type_counts)
  if (!typeCountsSync.ok) return typeCountsSync

  const vehicleCountsSync = await syncTreatedVehicleCounts(
    shiftId,
    draft.treated_vehicle_counts,
  )
  if (!vehicleCountsSync.ok) return vehicleCountsSync

  return { ok: true, shiftId, status: nextStatus }
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
}> {
  if (eventIds.length === 0) {
    return suggestRollupsFromLinkedEvents({ eventTypeIds: [], treated: [] })
  }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('event_type_id')
    .in('id', eventIds)

  if (eventsError) throw new Error(eventsError.message)

  const eventTypeIds = (events ?? []).map((row) => row.event_type_id as string | null)

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

  return suggestRollupsFromLinkedEvents({ eventTypeIds, treated })
}
