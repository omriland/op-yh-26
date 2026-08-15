import { plateDigits } from './format'
import { supabase } from './supabase'
import type { EventStatus, ParticipationStatus } from './status'

export { plateDigits }

export type ResponderFillDraft = {
  vehicle_plate: string
  odometer_start: string
  odometer_end: string
  route: string
  treatment_detail: string
  treatment_notes: string
}

export type ResponderFillErrors = Partial<
  Record<
    | 'vehicle_plate'
    | 'odometer_start'
    | 'odometer_end'
    | 'route'
    | 'treatment_detail'
    | 'form',
    string
  >
>

export type ResponderVehicleOption = {
  plate: string
  model: string
}

export type ResponderFillContext = {
  eventId: string
  assignmentId: string
  eventStatus: EventStatus
  event_date: string
  police_event_id: string | null
  event_type_name: string | null
  is_cancelled: boolean
  road_name: string | null
  location: string | null
  shift_lead_name: string | null
  /** Lead km for complete-gate only; never shown on fill UI. */
  totalKm: number | null
  participationStatus: ParticipationStatus
  updated_at: string | null
  draft: ResponderFillDraft
  /** Registered vehicles for this user — plate is selected from this list only. */
  vehicles: ResponderVehicleOption[]
}

export function deriveEventStatusAfterParticipation(
  participationStatuses: ParticipationStatus[],
): EventStatus {
  if (participationStatuses.length === 0) return 'draft'
  if (participationStatuses.every((status) => status === 'done')) return 'done'
  // Draft saves (`in_progress`) stay on the lead pipeline as in_progress —
  // partial only when at least one responder has fully completed.
  if (participationStatuses.some((status) => status === 'done')) return 'partial'
  return 'in_progress'
}

export function emptyResponderFillDraft(): ResponderFillDraft {
  return {
    vehicle_plate: '',
    odometer_start: '',
    odometer_end: '',
    route: '',
    treatment_detail: '',
    treatment_notes: '',
  }
}

function parseOptionalNumber(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (Number.isNaN(value)) return 'invalid'
  return value
}

export function validateResponderFillDraft(
  draft: ResponderFillDraft,
  mode: 'draft' | 'complete',
  allowedPlates: string[] = [],
  totalKm: number | null = null,
): ResponderFillErrors {
  const errors: ResponderFillErrors = {}
  const start = parseOptionalNumber(draft.odometer_start)
  const end = parseOptionalNumber(draft.odometer_end)
  const plate = plateDigits(draft.vehicle_plate)
  const allowed = new Set(allowedPlates.map(plateDigits).filter(Boolean))

  if (start === 'invalid') errors.odometer_start = 'מד אוץ התחלה חייב להיות מספר.'
  if (end === 'invalid') errors.odometer_end = 'מד אוץ סיום חייב להיות מספר.'

  if (mode === 'complete') {
    if (!plate) errors.vehicle_plate = 'יש לבחור רכב.'
    else if (allowed.size > 0 && !allowed.has(plate)) {
      errors.vehicle_plate = 'יש לבחור רכב מהרשימה המקושרת למשתמש.'
    } else if (allowed.size === 0) {
      errors.vehicle_plate = 'לא מקושר רכב למשתמש. פנו למנהל המערכת.'
    }
    if (start == null || start === 'invalid') errors.odometer_start = 'יש למלא מד אוץ התחלה.'
    if (totalKm == null) {
      errors.odometer_end =
        'האחמ״ש טרם הזין קילומטרים לאירוע. לא ניתן לסיים את הדיווח.'
    } else if (end == null || end === 'invalid') {
      errors.odometer_end = 'יש למלא מד אוץ סיום.'
    }
    if (!draft.route.trim()) errors.route = 'יש למלא נתיב נסיעה.'
    if (!draft.treatment_detail.trim()) errors.treatment_detail = 'יש למלא פירוט הטיפול.'
  }

  // Live + submit: start must be strictly lower than end once both are numbers.
  // Missing-totalKm complete error takes precedence over the range message.
  if (
    !errors.odometer_end &&
    typeof start === 'number' &&
    typeof end === 'number' &&
    end <= start
  ) {
    errors.odometer_end = 'מד אוץ סיום חייב להיות גדול ממד אוץ התחלה'
  }

  return errors
}

/** Field-level odometer check for immediate UI feedback. */
export function odometerRangeError(
  odometerStart: string,
  odometerEnd: string,
): string | undefined {
  const start = parseOptionalNumber(odometerStart)
  const end = parseOptionalNumber(odometerEnd)
  if (typeof start !== 'number' || typeof end !== 'number') return undefined
  if (end <= start) return 'מד אוץ סיום חייב להיות גדול ממד אוץ התחלה'
  return undefined
}

export async function fetchResponderFillContext(
  eventId: string,
  userId: string,
): Promise<ResponderFillContext | null> {
  const [{ data: event, error: eventError }, { data: vehicles, error: vehiclesError }] =
    await Promise.all([
      supabase
        .from('events')
        .select(
          `
          id, status, event_date, police_event_id, location, is_cancelled,
          event_type:event_types(name),
          road:roads(name),
          shift_lead:profiles(full_name, callsign),
          responders:event_responders(
            id, responder_id, vehicle_plate, odometer_start, odometer_end,
            total_km, route, treatment_detail, treatment_notes, status, updated_at
          )
        `,
        )
        .eq('id', eventId)
        .maybeSingle(),
      supabase
        .from('vehicles')
        .select('plate_number, model, archived')
        .eq('user_id', userId),
    ])

  if (eventError) throw new Error(eventError.message)
  if (vehiclesError) throw new Error(vehiclesError.message)
  if (!event) return null

  const row = event as unknown as {
    id: string
    status: EventStatus
    event_date: string
    police_event_id: string | null
    location: string | null
    is_cancelled: boolean
    event_type: { name: string } | null
    road: { name: string } | null
    shift_lead: { full_name: string; callsign: string } | null
    responders: {
      id: string
      responder_id: string
      vehicle_plate: string | null
      odometer_start: number | null
      odometer_end: number | null
      total_km: number | null
      route: string | null
      treatment_detail: string | null
      treatment_notes: string | null
      status: ParticipationStatus
      updated_at: string | null
    }[]
  }

  const mine = (row.responders ?? []).find((responder) => responder.responder_id === userId)
  if (!mine) return null

  const existingPlate = mine.vehicle_plate ? plateDigits(mine.vehicle_plate) : ''
  const totalKm = mine.total_km
  const odometerStart =
    mine.odometer_start != null ? String(mine.odometer_start) : ''
  const odometerEnd =
    mine.odometer_end != null ? String(mine.odometer_end) : ''

  // Active vehicles only for new assignment; keep a currently saved plate even if archived.
  const vehicleOptions: ResponderVehicleOption[] = (vehicles ?? [])
    .map((vehicle) => ({
      plate: plateDigits(String(vehicle.plate_number ?? '')),
      model: String(vehicle.model ?? '').trim(),
      archived: Boolean(vehicle.archived),
    }))
    .filter((vehicle) => vehicle.plate)
    .filter((vehicle) => !vehicle.archived || vehicle.plate === existingPlate)
    .map(({ plate, model }) => ({ plate, model }))

  const allowed = new Set(vehicleOptions.map((vehicle) => vehicle.plate))
  const selectedPlate =
    existingPlate && allowed.has(existingPlate)
      ? existingPlate
      : vehicleOptions.length === 1
        ? vehicleOptions[0]!.plate
        : ''

  return {
    eventId: row.id,
    assignmentId: mine.id,
    eventStatus: row.status,
    event_date: row.event_date,
    police_event_id: row.police_event_id,
    event_type_name: row.event_type?.name ?? null,
    is_cancelled: row.is_cancelled ?? false,
    road_name: row.road?.name ?? null,
    location: row.location,
    shift_lead_name: row.shift_lead
      ? `${row.shift_lead.full_name} · ${row.shift_lead.callsign}`
      : null,
    totalKm,
    participationStatus: mine.status,
    updated_at: mine.updated_at,
    vehicles: vehicleOptions,
    draft: {
      vehicle_plate: selectedPlate,
      odometer_start: odometerStart,
      odometer_end: odometerEnd,
      route: mine.route ?? '',
      treatment_detail: mine.treatment_detail ?? '',
      treatment_notes: mine.treatment_notes ?? '',
    },
  }
}

async function refreshEventStatus(eventId: string): Promise<EventStatus | null> {
  const { data, error } = await supabase.rpc('apply_event_status_from_participations', {
    p_event_id: eventId,
  })
  if (error) {
    // Fallback: derive from rows if RPC missing (local/dev drift) — may fail RLS for responders.
    const { data: rows, error: listError } = await supabase
      .from('event_responders')
      .select('status')
      .eq('event_id', eventId)
    if (listError) return null
    const next = deriveEventStatusAfterParticipation(
      (rows ?? []).map((row) => row.status as ParticipationStatus),
    )
    await supabase
      .from('events')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', eventId)
    return next
  }
  return data as EventStatus
}

async function saveParticipation(input: {
  assignmentId: string
  eventId: string
  draft: ResponderFillDraft
  status: ParticipationStatus
}): Promise<{ ok: true; eventStatus: EventStatus | null } | { ok: false; error: string }> {
  const start = parseOptionalNumber(input.draft.odometer_start)
  const end = parseOptionalNumber(input.draft.odometer_end)
  if (start === 'invalid' || end === 'invalid') {
    return { ok: false, error: 'קילומטרים חייבים להיות מספר.' }
  }

  const { data: current, error: currentError } = await supabase
    .from('event_responders')
    .select('status, event:events!inner(status)')
    .eq('id', input.assignmentId)
    .maybeSingle()

  if (currentError) {
    return { ok: false, error: 'שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  if (!current) {
    return { ok: false, error: 'לא נמצא דיווח לעדכון.' }
  }

  const participationStatus = current.status as ParticipationStatus
  const nestedEvent = (current as { event?: { status: EventStatus } | { status: EventStatus }[] | null })
    .event
  const eventStatusRaw = Array.isArray(nestedEvent)
    ? nestedEvent[0]?.status
    : nestedEvent?.status
  if (participationStatus === 'done' || eventStatusRaw === 'done') {
    return {
      ok: false,
      error: 'לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך.',
    }
  }

  const { data: updated, error } = await supabase
    .from('event_responders')
    .update({
      vehicle_plate: plateDigits(input.draft.vehicle_plate) || null,
      odometer_start: start,
      odometer_end: end,
      route: input.draft.route.trim() || null,
      treatment_detail: input.draft.treatment_detail.trim() || null,
      treatment_notes: input.draft.treatment_notes.trim() || null,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.assignmentId)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  // RLS can filter the row with no error — treat empty update as locked.
  if (!updated) {
    return {
      ok: false,
      error: 'לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך.',
    }
  }

  const eventStatus = await refreshEventStatus(input.eventId)
  return { ok: true, eventStatus }
}

export async function saveResponderFillDraft(input: {
  assignmentId: string
  eventId: string
  draft: ResponderFillDraft
  allowedPlates: string[]
  totalKm: number | null
}): Promise<
  | { ok: true; eventStatus: EventStatus | null }
  | { ok: false; error: string; fieldErrors?: ResponderFillErrors }
> {
  const fieldErrors = validateResponderFillDraft(
    input.draft,
    'draft',
    input.allowedPlates,
    input.totalKm,
  )
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'בדקו את השדות המסומנים.', fieldErrors }
  }
  return saveParticipation({ ...input, status: 'in_progress' })
}

export async function completeResponderFill(input: {
  assignmentId: string
  eventId: string
  draft: ResponderFillDraft
  allowedPlates: string[]
  totalKm: number | null
}): Promise<
  | { ok: true; eventStatus: EventStatus | null }
  | { ok: false; error: string; fieldErrors?: ResponderFillErrors }
> {
  const fieldErrors = validateResponderFillDraft(
    input.draft,
    'complete',
    input.allowedPlates,
    input.totalKm,
  )
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'יש למלא את כל שדות החובה לפני סיום הדיווח.', fieldErrors }
  }
  return saveParticipation({ ...input, status: 'done' })
}
