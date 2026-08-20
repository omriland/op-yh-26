import { sortByRoadName } from './roadSort'
import { supabase } from './supabase'
import type { EventStatus, ParticipationStatus } from './status'
import { fillReadyNotifyIds } from './fillReadyNotify'
import { notifyFillReady } from './responderFillToken'
import { planTrackingSync } from './liveTrack'
import { startResponderTracking, stopResponderTracking } from './liveTrackApi'
import {
  districtNeedsPlacesLocation,
  LOCATION_REQUIRED_ERROR,
} from './systemDistricts'

export type LookupOption = { id: string; name: string; code?: string | null }

export type AssignableUser = {
  id: string
  full_name: string
  callsign: string
  hasVehicle: boolean
}

export const NO_VEHICLE_KM_PLACEHOLDER = 'מתנדב ללא רכב'

export function hasActiveVehicle(
  vehicles: { archived?: boolean | null }[] | null | undefined,
): boolean {
  return (vehicles ?? []).some((row) => !row.archived)
}

/** Lead `total_km` is never stored for a responder with no active vehicle. */
export function leadKmForSave(hasVehicle: boolean, totalKm: string): number | null {
  if (!hasVehicle) return null
  const trimmed = totalKm.trim()
  if (trimmed === '') return null
  return Number(trimmed)
}

export type TreatedDraft = { vehicle_kind_id: string; quantity: number }

export type ResponderDraft = {
  key: string
  assignmentId?: string
  responder_id: string
  full_name: string
  callsign: string
  /** HH:MM UI — stored as started_at on event_date */
  start_time: string
  /** HH:MM UI — stored as ended_at on event_date, or next day if end < start */
  end_time: string
  total_km: string
  emergency_means: boolean
  treated: TreatedDraft[]
  status: ParticipationStatus
  hasOwnedData: boolean
  expanded: boolean
  /** Active (non-archived) vehicle on the responder profile. */
  hasVehicle: boolean
}

/** `timestamp` / `time` / ISO → `HH:MM` for time inputs. */
export function toTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const timePart = value.includes('T') ? value.split('T')[1]! : value.includes(' ') ? value.split(' ')[1]! : value
  return timePart.slice(0, 5)
}

/** End clock earlier than start ⇒ overnight (end on event_date + 1). */
export function isOvernightEnd(startTime: string, endTime: string): boolean {
  if (!startTime.trim() || !endTime.trim()) return false
  return endTime < startTime
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Wall-clock timestamp (no TZ) for Postgres `timestamp without time zone`. */
export function wallTimestamp(
  eventDate: string,
  timeHm: string,
  dayOffset = 0,
): string | null {
  const time = timeHm.trim()
  if (!time || !eventDate) return null
  const normalized = time.length === 5 ? `${time}:00` : time
  return `${addDaysYmd(eventDate, dayOffset)}T${normalized}`
}

export type EventFormDraft = {
  id?: string
  status: EventStatus
  event_date: string
  police_event_id: string
  district_id: string
  patrol_callsign: string
  event_type_id: string
  road_id: string
  location: string
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
  notes: string
  is_cancelled: boolean
  shift_lead: { full_name: string; callsign: string }
  responders: ResponderDraft[]
}

export const CANCELLED_TREATED_BLOCK =
  'לא ניתן לסמן בוטל כל עוד רשומים רכבים שטופלו. נקו תחילה את הכמויות.'

export const CANCELLED_CLEAR_ADMIN_ONLY = 'רק מנהל יכול לבטל סימון בוטל.'

export function totalTreatedQuantity(
  responders: { treated: { quantity: number }[] }[],
): number {
  return responders.reduce(
    (sum, responder) =>
      sum + responder.treated.reduce((inner, row) => inner + row.quantity, 0),
    0,
  )
}

export function applyCancelledChange(input: {
  next: boolean
  current: boolean
  treatedTotal: number
  isAdmin: boolean
}): { ok: true; is_cancelled: boolean } | { ok: false; error: string } {
  const { next, current, treatedTotal, isAdmin } = input
  if (next === current) return { ok: true, is_cancelled: current }
  if (next && treatedTotal > 0) return { ok: false, error: CANCELLED_TREATED_BLOCK }
  if (!next && !isAdmin) return { ok: false, error: CANCELLED_CLEAR_ADMIN_ONLY }
  return { ok: true, is_cancelled: next }
}

export type EventFormErrors = Partial<
  Record<
    | 'event_date'
    | 'police_event_id'
    | 'district_id'
    | 'event_type_id'
    | 'road_id'
    | 'location'
    | 'form',
    string
  >
>

export function validateCancelledSave(input: {
  is_cancelled: boolean
  treatedTotal: number
  isAdmin: boolean
  previousIsCancelled: boolean
}): EventFormErrors | null {
  const { is_cancelled, treatedTotal, isAdmin, previousIsCancelled } = input
  if (is_cancelled && treatedTotal > 0) {
    return { form: CANCELLED_TREATED_BLOCK }
  }
  if (previousIsCancelled && !is_cancelled && !isAdmin) {
    return { form: CANCELLED_CLEAR_ADMIN_ONLY }
  }
  return null
}

export type EventLookups = {
  districts: LookupOption[]
  eventTypes: LookupOption[]
  roads: LookupOption[]
  vehicleKinds: LookupOption[]
}

/** YYYY-MM-DD in Asia/Jerusalem. */
export function todayJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function emptyEventDraft(lead: {
  full_name: string
  callsign: string
}): EventFormDraft {
  return {
    status: 'draft',
    event_date: todayJerusalem(),
    police_event_id: '',
    district_id: '',
    patrol_callsign: '',
    event_type_id: '',
    road_id: '',
    location: '',
    location_place_id: null,
    location_lat: null,
    location_lng: null,
    notes: '',
    is_cancelled: false,
    shift_lead: lead,
    responders: [],
  }
}

async function fetchLookup(table: 'event_types' | 'roads' | 'vehicle_kinds') {
  const { data, error } = await supabase
    .from(table)
    .select('id, name')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  const items = (data ?? []) as LookupOption[]
  return table === 'roads' ? sortByRoadName(items) : items
}

async function fetchDistrictLookup(): Promise<LookupOption[]> {
  const { data, error } = await supabase
    .from('districts')
    .select('id, name, code')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as LookupOption[]
}

export async function fetchEventLookups(): Promise<EventLookups> {
  const [districts, eventTypes, roads, vehicleKinds] = await Promise.all([
    fetchDistrictLookup(),
    fetchLookup('event_types'),
    fetchLookup('roads'),
    fetchLookup('vehicle_kinds'),
  ])
  return { districts, eventTypes, roads, vehicleKinds }
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, callsign, vehicles(id, archived)')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as {
    id: string
    full_name: string
    callsign: string
    vehicles: { id: string; archived: boolean | null }[] | null
  }[]).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    callsign: row.callsign,
    hasVehicle: hasActiveVehicle(row.vehicles),
  }))
}

type LoadedResponder = {
  id: string
  responder_id: string
  started_at: string | null
  ended_at: string | null
  total_km: number | null
  emergency_means: boolean
  status: ParticipationStatus
  vehicle_plate: string | null
  odometer_start: number | null
  odometer_end: number | null
  route: string | null
  treatment_detail: string | null
  treatment_notes: string | null
  profile: {
    full_name: string
    callsign: string
    vehicles: { id: string; archived: boolean | null }[] | null
  } | null
  treated: { vehicle_kind_id: string; quantity: number }[]
}

export async function fetchEventForEdit(eventId: string): Promise<EventFormDraft | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      `
      id, status, event_date, police_event_id, district_id, patrol_callsign,
      event_type_id, road_id, location, location_place_id, location_lat, location_lng,
      notes, is_cancelled,
      shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
      responders:event_responders(
        id, responder_id, started_at, ended_at, total_km, emergency_means, status,
        vehicle_plate, odometer_start, odometer_end, route,
        treatment_detail, treatment_notes,
        profile:profiles(full_name, callsign, vehicles(id, archived)),
        treated:event_treated_vehicles(vehicle_kind_id, quantity)
      )
    `,
    )
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const row = data as unknown as {
    id: string
    status: EventStatus
    event_date: string
    police_event_id: string | null
    district_id: string | null
    patrol_callsign: string | null
    event_type_id: string | null
    road_id: string | null
    location: string | null
    location_place_id: string | null
    location_lat: number | null
    location_lng: number | null
    notes: string | null
    is_cancelled: boolean
    shift_lead: { full_name: string; callsign: string } | null
    responders: LoadedResponder[]
  }

  return {
    id: row.id,
    status: row.status,
    event_date: row.event_date,
    police_event_id: row.police_event_id ?? '',
    district_id: row.district_id ?? '',
    patrol_callsign: row.patrol_callsign ?? '',
    event_type_id: row.event_type_id ?? '',
    road_id: row.road_id ?? '',
    location: row.location ?? '',
    location_place_id: row.location_place_id ?? null,
    location_lat: row.location_lat ?? null,
    location_lng: row.location_lng ?? null,
    notes: row.notes ?? '',
    is_cancelled: row.is_cancelled ?? false,
    shift_lead: row.shift_lead ?? { full_name: '—', callsign: '—' },
    responders: (row.responders ?? []).map((responder) => {
      const hasVehicle = hasActiveVehicle(responder.profile?.vehicles)
      return {
        key: responder.id,
        assignmentId: responder.id,
        responder_id: responder.responder_id,
        full_name: responder.profile?.full_name ?? 'כונן',
        callsign: responder.profile?.callsign ?? '—',
        start_time: toTimeInput(responder.started_at),
        end_time: toTimeInput(responder.ended_at),
        total_km: hasVehicle && responder.total_km != null ? String(responder.total_km) : '',
        emergency_means: responder.emergency_means,
        treated: (responder.treated ?? []).map((item) => ({
          vehicle_kind_id: item.vehicle_kind_id,
          quantity: item.quantity,
        })),
        status: responder.status,
        hasOwnedData: Boolean(
          responder.vehicle_plate ||
            responder.odometer_start != null ||
            responder.odometer_end != null ||
            responder.route ||
            responder.treatment_detail ||
            responder.treatment_notes,
        ),
        expanded: false,
        hasVehicle,
      }
    }),
  }
}

/** Minimum to create/keep an event: date + event type + road (+ location for system שלוחות). */
export function validateEventMinimum(
  draft: EventFormDraft,
  districts: LookupOption[] = [],
): EventFormErrors {
  const errors: EventFormErrors = {}
  if (!draft.event_date) errors.event_date = 'יש לבחור תאריך.'
  if (!draft.event_type_id) errors.event_type_id = 'יש לבחור סוג אירוע.'
  if (!draft.road_id) errors.road_id = 'יש לבחור כביש.'
  if (districtNeedsPlacesLocation(districts, draft.district_id) && !draft.location.trim()) {
    errors.location = LOCATION_REQUIRED_ERROR
  }
  return errors
}

export function hasEventMinimum(
  draft: EventFormDraft,
  districts: LookupOption[] = [],
): boolean {
  return Object.keys(validateEventMinimum(draft, districts)).length === 0
}

export function canPersistEventDraft(
  draft: EventFormDraft,
  districts: LookupOption[] = [],
  options?: { allowPartial?: boolean },
): EventFormErrors {
  if (options?.allowPartial) {
    return draft.event_date ? {} : { event_date: 'יש לבחור תאריך.' }
  }
  return validateEventMinimum(draft, districts)
}

export function eventForeignIds(
  draft: EventFormDraft,
  options?: { allowPartial?: boolean },
): {
  event_type_id: string | null
  road_id: string | null
  district_id: string | null
} {
  const allowPartial = Boolean(options?.allowPartial)
  return {
    event_type_id: draft.event_type_id || (allowPartial ? null : draft.event_type_id),
    road_id: draft.road_id || (allowPartial ? null : draft.road_id),
    district_id: draft.district_id || null,
  }
}

/** Persist place ids/coords only when a Google pick is current. */
export function buildLocationPayload(draft: EventFormDraft): {
  location: string | null
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
} {
  const location = draft.location.trim() || null
  if (!location) {
    return {
      location: null,
      location_place_id: null,
      location_lat: null,
      location_lng: null,
    }
  }
  const hasPlace =
    Boolean(draft.location_place_id) &&
    draft.location_lat != null &&
    draft.location_lng != null
  return {
    location,
    location_place_id: hasPlace ? draft.location_place_id : null,
    location_lat: hasPlace ? draft.location_lat : null,
    location_lng: hasPlace ? draft.location_lng : null,
  }
}

/**
 * Derive stored event status from current assignments.
 * Adding a new pending responder after `done` must reopen to `partial` —
 * never freeze the previous status.
 */
export function deriveEventStatus(draft: EventFormDraft): EventStatus {
  if (draft.responders.length === 0) return 'draft'
  if (draft.responders.every((row) => row.status === 'done')) return 'done'
  if (draft.responders.some((row) => row.status === 'done')) return 'partial'
  return 'in_progress'
}

/** Attach DB assignment ids after insert so the next save updates instead of re-inserting. */
export function mergeAssignmentIds(
  responders: ResponderDraft[],
  byResponderId: Record<string, string>,
): ResponderDraft[] {
  return responders.map((row) => {
    const assignmentId = row.assignmentId ?? byResponderId[row.responder_id]
    return assignmentId ? { ...row, assignmentId } : row
  })
}

export async function saveEventForm(input: {
  draft: EventFormDraft
  shiftLeadId: string
  vehicleKinds: LookupOption[]
  districts: LookupOption[]
  isAdmin: boolean
  previousIsCancelled: boolean
  allowPartial?: boolean
}): Promise<
  | {
      ok: true
      eventId: string
      status: EventStatus
      assignmentIds: Record<string, string>
      trackingStartFailed: boolean
      trackingStopFailed: boolean
    }
  | { ok: false; error: string; fieldErrors?: EventFormErrors }
> {
  const { draft, shiftLeadId, vehicleKinds, districts, isAdmin, previousIsCancelled } = input
  const allowPartial = Boolean(input.allowPartial)

  const fieldErrors = canPersistEventDraft(draft, districts, { allowPartial })
  if (Object.keys(fieldErrors).length > 0) {
    const needsLocation = Boolean(fieldErrors.location)
    return {
      ok: false,
      error: needsLocation
        ? 'יש למלא תאריך, סוג אירוע, כביש ומיקום כדי ליצור אירוע.'
        : 'יש למלא תאריך, סוג אירוע וכביש כדי ליצור אירוע.',
      fieldErrors,
    }
  }

  const cancelledErrors = validateCancelledSave({
    is_cancelled: draft.is_cancelled,
    treatedTotal: totalTreatedQuantity(draft.responders),
    isAdmin,
    previousIsCancelled,
  })
  if (cancelledErrors) {
    return {
      ok: false,
      error: cancelledErrors.form ?? CANCELLED_TREATED_BLOCK,
      fieldErrors: cancelledErrors,
    }
  }

  const nextStatus = deriveEventStatus(draft)

  const locationPayload = buildLocationPayload(draft)
  const foreignIds = eventForeignIds(draft, { allowPartial })
  const eventPayload = {
    event_date: draft.event_date,
    police_event_id: draft.police_event_id.trim() || null,
    district_id: foreignIds.district_id,
    patrol_callsign: draft.patrol_callsign.trim() || null,
    event_type_id: foreignIds.event_type_id,
    road_id: foreignIds.road_id,
    location: locationPayload.location,
    location_place_id: locationPayload.location_place_id,
    location_lat: locationPayload.location_lat,
    location_lng: locationPayload.location_lng,
    notes: draft.notes.trim() || null,
    is_cancelled: draft.is_cancelled,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }

  let eventId = draft.id

  if (eventId) {
    // Keep original shift_lead_id — אחמ״ש is the creator, not the last editor.
    const { error } = await supabase.from('events').update(eventPayload).eq('id', eventId)
    if (error) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  } else {
    const { data, error } = await supabase
      .from('events')
      .insert({ ...eventPayload, shift_lead_id: shiftLeadId })
      .select('id')
      .single()
    if (error || !data) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
    eventId = data.id as string
  }

  const sync = await syncResponders({
    eventId,
    eventDate: draft.event_date,
    responders: draft.responders,
    vehicleKinds,
    isCancelled: draft.is_cancelled,
  })
  if (!sync.ok) return sync

  const notifyIds = fillReadyNotifyIds(sync.previousKm, sync.nextKmRows)
  if (notifyIds.length > 0 && !draft.is_cancelled) {
    // Soft-fail: event save already succeeded.
    void notifyFillReady({ eventResponderIds: notifyIds }).catch(() => {})
  }

  const nextAssignments = draft.responders.flatMap((responder) => {
    const assignmentId = sync.assignmentIds[responder.responder_id]
    if (!assignmentId) return []
    const overnight = isOvernightEnd(responder.start_time, responder.end_time)
    return [
      {
        id: assignmentId,
        endedAt: wallTimestamp(draft.event_date, responder.end_time, overnight ? 1 : 0),
      },
    ]
  })
  const trackingPlan = planTrackingSync({
    previous: sync.previousAssignments,
    next: nextAssignments,
  })
  const leftoverStopIds = trackingPlan.stopIds.filter((id) => !sync.removedIds.includes(id))
  let trackingStopFailed = sync.trackingStopFailed
  let trackingStartFailed = false
  if (leftoverStopIds.length > 0) {
    const stopped = await stopResponderTracking(leftoverStopIds)
    if (!stopped.ok) trackingStopFailed = true
  }
  if (trackingPlan.startIds.length > 0) {
    const started = await startResponderTracking(trackingPlan.startIds)
    if (!started.ok) trackingStartFailed = true
  }

  return {
    ok: true,
    eventId,
    status: nextStatus,
    assignmentIds: sync.assignmentIds,
    trackingStartFailed,
    trackingStopFailed,
  }
}

async function syncResponders(input: {
  eventId: string
  eventDate: string
  responders: ResponderDraft[]
  vehicleKinds: LookupOption[]
  isCancelled: boolean
}): Promise<
  | {
      ok: true
      assignmentIds: Record<string, string>
      previousKm: { id: string; total_km: number | null }[]
      nextKmRows: { assignmentId: string; totalKm: number | null }[]
      previousAssignments: { id: string; endedAt: string | null }[]
      removedIds: string[]
      trackingStopFailed: boolean
    }
  | { ok: false; error: string }
> {
  const { eventId, eventDate, responders, vehicleKinds, isCancelled } = input

  const { data: existing, error: existingError } = await supabase
    .from('event_responders')
    .select('id, responder_id, total_km, ended_at')
    .eq('event_id', eventId)

  if (existingError) {
    return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const previousAssignments = (existing ?? []).map((row) => ({
    id: row.id as string,
    endedAt: (row.ended_at as string | null) ?? null,
  }))

  const existingByResponder = new Map(
    (existing ?? []).map((row) => [row.responder_id as string, row.id as string]),
  )
  const previousKm = (existing ?? []).map((row) => ({
    id: row.id as string,
    total_km: (row.total_km as number | null) ?? null,
  }))
  const keepIds = new Set(responders.map((row) => row.responder_id))
  const toRemove = (existing ?? []).filter((row) => !keepIds.has(row.responder_id as string))
  const removedIds = toRemove.map((row) => row.id as string)
  let trackingStopFailed = false

  if (removedIds.length > 0) {
    const stopped = await stopResponderTracking(removedIds)
    if (!stopped.ok) trackingStopFailed = true
    const { error } = await supabase.from('event_responders').delete().in('id', removedIds)
    if (error) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const assignmentIds: Record<string, string> = {}
  const nextKmRows: { assignmentId: string; totalKm: number | null }[] = []

  for (const responder of responders) {
    const km = leadKmForSave(responder.hasVehicle, responder.total_km)
    if (km != null && Number.isNaN(km)) {
      return { ok: false, error: 'קילומטרים חייבים להיות מספר.' }
    }

    const overnight = isOvernightEnd(responder.start_time, responder.end_time)
    const startedAt = wallTimestamp(eventDate, responder.start_time, 0)
    const endedAt = wallTimestamp(eventDate, responder.end_time, overnight ? 1 : 0)

    // Draft may lack assignmentId after the first insert in this session — reuse DB row.
    let assignmentId =
      responder.assignmentId ?? existingByResponder.get(responder.responder_id) ?? undefined
    if (assignmentId) {
      const { error } = await supabase
        .from('event_responders')
        .update({
          started_at: startedAt,
          ended_at: endedAt,
          total_km: km,
          emergency_means: responder.emergency_means,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)
      if (error) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    } else {
      const { data, error } = await supabase
        .from('event_responders')
        .insert({
          event_id: eventId,
          responder_id: responder.responder_id,
          started_at: startedAt,
          ended_at: endedAt,
          total_km: km,
          emergency_means: responder.emergency_means,
          status: 'pending',
        })
        .select('id')
        .single()
      if (error || !data) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
      assignmentId = data.id as string
      existingByResponder.set(responder.responder_id, assignmentId)
    }

    assignmentIds[responder.responder_id] = assignmentId
    nextKmRows.push({ assignmentId, totalKm: km })

    const { error: clearError } = await supabase
      .from('event_treated_vehicles')
      .delete()
      .eq('event_responder_id', assignmentId)
    if (clearError) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }

    if (!isCancelled) {
      const treatedRows: {
        event_responder_id: string
        vehicle_kind_id: string
        quantity: number
      }[] = []
      for (const kind of vehicleKinds) {
        const quantity =
          responder.treated.find((row) => row.vehicle_kind_id === kind.id)?.quantity ?? 0
        if (quantity > 0) {
          treatedRows.push({
            event_responder_id: assignmentId,
            vehicle_kind_id: kind.id,
            quantity,
          })
        }
      }

      if (treatedRows.length > 0) {
        const { error } = await supabase.from('event_treated_vehicles').insert(treatedRows)
        if (error) {
          return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
        }
      }
    }
  }

  return {
    ok: true,
    assignmentIds,
    previousKm,
    nextKmRows,
    previousAssignments,
    removedIds,
    trackingStopFailed,
  }
}
