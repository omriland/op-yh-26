import { sortByRoadName } from './roadSort'
import { supabase } from './supabase'
import type { EventStatus, ParticipationStatus } from './status'

export type LookupOption = { id: string; name: string }

export type AssignableUser = {
  id: string
  full_name: string
  callsign: string
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
  notes: string
  shift_lead: { full_name: string; callsign: string }
  responders: ResponderDraft[]
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
    notes: '',
    shift_lead: lead,
    responders: [],
  }
}

async function fetchLookup(table: 'districts' | 'event_types' | 'roads' | 'vehicle_kinds') {
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

export async function fetchEventLookups(): Promise<EventLookups> {
  const [districts, eventTypes, roads, vehicleKinds] = await Promise.all([
    fetchLookup('districts'),
    fetchLookup('event_types'),
    fetchLookup('roads'),
    fetchLookup('vehicle_kinds'),
  ])
  return { districts, eventTypes, roads, vehicleKinds }
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, callsign')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as AssignableUser[]
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
  profile: { full_name: string; callsign: string } | null
  treated: { vehicle_kind_id: string; quantity: number }[]
}

export async function fetchEventForEdit(eventId: string): Promise<EventFormDraft | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      `
      id, status, event_date, police_event_id, district_id, patrol_callsign,
      event_type_id, road_id, location, notes,
      shift_lead:profiles(full_name, callsign),
      responders:event_responders(
        id, responder_id, started_at, ended_at, total_km, emergency_means, status,
        vehicle_plate, odometer_start, odometer_end, route,
        treatment_detail, treatment_notes,
        profile:profiles(full_name, callsign),
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
    notes: string | null
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
    notes: row.notes ?? '',
    shift_lead: row.shift_lead ?? { full_name: '—', callsign: '—' },
    responders: (row.responders ?? []).map((responder) => ({
      key: responder.id,
      assignmentId: responder.id,
      responder_id: responder.responder_id,
      full_name: responder.profile?.full_name ?? 'כונן',
      callsign: responder.profile?.callsign ?? '—',
      start_time: toTimeInput(responder.started_at),
      end_time: toTimeInput(responder.ended_at),
      total_km: responder.total_km != null ? String(responder.total_km) : '',
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
    })),
  }
}

export type EventFormErrors = Partial<
  Record<
    'event_date' | 'police_event_id' | 'district_id' | 'event_type_id' | 'road_id' | 'form',
    string
  >
>

/** Minimum to create/keep an event: date + event type + road. */
export function validateEventMinimum(draft: EventFormDraft): EventFormErrors {
  const errors: EventFormErrors = {}
  if (!draft.event_date) errors.event_date = 'יש לבחור תאריך.'
  if (!draft.event_type_id) errors.event_type_id = 'יש לבחור סוג אירוע.'
  if (!draft.road_id) errors.road_id = 'יש לבחור כביש.'
  return errors
}

export function hasEventMinimum(draft: EventFormDraft): boolean {
  return Object.keys(validateEventMinimum(draft)).length === 0
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
}): Promise<
  | { ok: true; eventId: string; status: EventStatus; assignmentIds: Record<string, string> }
  | { ok: false; error: string; fieldErrors?: EventFormErrors }
> {
  const { draft, shiftLeadId, vehicleKinds } = input

  const fieldErrors = validateEventMinimum(draft)
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: 'יש למלא תאריך, סוג אירוע וכביש כדי ליצור אירוע.',
      fieldErrors,
    }
  }

  const nextStatus = deriveEventStatus(draft)

  const eventPayload = {
    event_date: draft.event_date,
    police_event_id: draft.police_event_id.trim() || null,
    district_id: draft.district_id || null,
    patrol_callsign: draft.patrol_callsign.trim() || null,
    event_type_id: draft.event_type_id,
    road_id: draft.road_id,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
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
  })
  if (!sync.ok) return sync

  return { ok: true, eventId, status: nextStatus, assignmentIds: sync.assignmentIds }
}

async function syncResponders(input: {
  eventId: string
  eventDate: string
  responders: ResponderDraft[]
  vehicleKinds: LookupOption[]
}): Promise<
  | { ok: true; assignmentIds: Record<string, string> }
  | { ok: false; error: string }
> {
  const { eventId, eventDate, responders, vehicleKinds } = input

  const { data: existing, error: existingError } = await supabase
    .from('event_responders')
    .select('id, responder_id')
    .eq('event_id', eventId)

  if (existingError) {
    return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const existingByResponder = new Map(
    (existing ?? []).map((row) => [row.responder_id as string, row.id as string]),
  )
  const keepIds = new Set(responders.map((row) => row.responder_id))
  const toRemove = (existing ?? []).filter((row) => !keepIds.has(row.responder_id as string))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('event_responders')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const assignmentIds: Record<string, string> = {}

  for (const responder of responders) {
    const km = responder.total_km.trim() === '' ? null : Number(responder.total_km)
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

    const { error: clearError } = await supabase
      .from('event_treated_vehicles')
      .delete()
      .eq('event_responder_id', assignmentId)
    if (clearError) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }

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

  return { ok: true, assignmentIds }
}
