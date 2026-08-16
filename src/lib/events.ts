import { searchQueryVariants } from './searchQuery'
import type { EventOrigin } from './shiftBornEvents'
import { supabase } from './supabase'
import type { EventStatus, ParticipationStatus } from './status'
import {
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  type ShiftKind,
  type ShiftVehicleType,
} from './shifts'
import { formatDate, formatPlate } from './format'

export type EventResponderSummary = {
  id: string
  responder_id: string
  status: ParticipationStatus
  profile: { full_name: string; callsign: string } | null
}

export type EventListItem = {
  id: string
  event_date: string
  police_event_id: string | null
  patrol_callsign: string | null
  location: string | null
  status: EventStatus
  is_cancelled: boolean
  origin: EventOrigin
  shift_id: string | null
  treatment_detail: string | null
  treatment_notes: string | null
  emergency_means: boolean
  district: { name: string } | null
  event_type: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  last_saved: { full_name: string } | null
  shift: {
    shift_date: string
    shift_kind: ShiftKind
    vehicle_type: ShiftVehicleType
    personal_vehicle: { plate_number: string } | null
  } | null
  shared_treated: { id: string }[]
  responders: EventResponderSummary[]
}

export const EVENT_LIST_SELECT = `
  id,
  event_date,
  police_event_id,
  patrol_callsign,
  location,
  status,
  is_cancelled,
  origin,
  shift_id,
  treatment_detail,
  treatment_notes,
  emergency_means,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  last_saved:profiles!events_last_saved_by_fkey(full_name),
  shift:shifts!events_shift_id_fkey(
    shift_date,
    shift_kind,
    vehicle_type,
    personal_vehicle:vehicles!shifts_personal_vehicle_id_fkey(plate_number)
  ),
  shared_treated:event_treated_vehicles!event_treated_vehicles_event_id_fkey(id),
  responders:event_responders(
    id,
    responder_id,
    status,
    profile:profiles(full_name, callsign)
  )
`

/** Default window for the unit events table. Search can hydrate older rows. */
export const UNIT_EVENTS_LIST_LIMIT = 200

export function unitEventsListHint(limit: number): string {
  return `מציג את ${limit} האירועים האחרונים. ניתן להשתמש בחיפוש לשליפת אירועים ישנים יותר`
}

export function missingSearchEventIds(
  loadedIds: Iterable<string>,
  searchIds: ReadonlySet<string>,
): string[] {
  const loaded = new Set(loadedIds)
  return [...searchIds].filter((id) => !loaded.has(id))
}

export function mergeEventLists(
  loaded: EventListItem[],
  extras: EventListItem[],
): EventListItem[] {
  const byId = new Map<string, EventListItem>()
  for (const event of loaded) byId.set(event.id, event)
  for (const event of extras) {
    if (!byId.has(event.id)) byId.set(event.id, event)
  }
  return [...byId.values()].sort((a, b) => {
    if (a.event_date !== b.event_date) return a.event_date < b.event_date ? 1 : -1
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
}

/** Unit-wide list for shift-leads and admins; RLS narrows it for everyone else. */
export async function fetchEvents(opts?: { limit?: number }): Promise<EventListItem[]> {
  let query = supabase
    .from('events')
    .select(EVENT_LIST_SELECT)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.limit != null) {
    query = query.limit(opts.limit)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EventListItem[]
}

const EVENT_ID_CHUNK = 100

/** Hydrate unit-list rows for search hits that are outside the default window. */
export async function fetchEventsByIds(ids: string[]): Promise<EventListItem[]> {
  if (ids.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += EVENT_ID_CHUNK) {
    chunks.push(ids.slice(i, i + EVENT_ID_CHUNK))
  }

  const rows: EventListItem[] = []
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_LIST_SELECT)
      .in('id', chunk)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as unknown as EventListItem[]))
  }

  return mergeEventLists([], rows)
}

/** Events the viewer is assigned to as a responder. */
export async function fetchMyEvents(userId: string): Promise<EventListItem[]> {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('event_responders')
    .select('event_id')
    .eq('responder_id', userId)

  if (assignmentsError) throw new Error(assignmentsError.message)

  const eventIds = (assignments ?? []).map((row) => row.event_id as string)
  if (eventIds.length === 0) return []

  const { data, error } = await supabase
    .from('events')
    .select(EVENT_LIST_SELECT)
    .in('id', eventIds)
    .order('event_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EventListItem[]
}

export type EventResponderDetail = {
  id: string
  responder_id: string
  started_at: string | null
  ended_at: string | null
  vehicle_plate: string | null
  total_km: number | null
  odometer_start: number | null
  odometer_end: number | null
  route: string | null
  treatment_detail: string | null
  emergency_means: boolean
  treatment_notes: string | null
  status: ParticipationStatus
  profile: { full_name: string; callsign: string } | null
  treated: { quantity: number; kind: { name: string } | null }[]
}

export type EventDetail = Omit<EventListItem, 'responders'> & {
  notes: string | null
  road_id: string | null
  location_lat: number | null
  location_lng: number | null
  updated_at: string
  responders: EventResponderDetail[]
}

const EVENT_DETAIL_SELECT = `
  id,
  event_date,
  police_event_id,
  patrol_callsign,
  location,
  road_id,
  location_lat,
  location_lng,
  notes,
  status,
  is_cancelled,
  origin,
  shift_id,
  treatment_detail,
  treatment_notes,
  emergency_means,
  updated_at,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  last_saved:profiles!events_last_saved_by_fkey(full_name),
  shift:shifts!events_shift_id_fkey(
    shift_date,
    shift_kind,
    vehicle_type,
    personal_vehicle:vehicles!shifts_personal_vehicle_id_fkey(plate_number)
  ),
  shared_treated:event_treated_vehicles!event_treated_vehicles_event_id_fkey(id),
  responders:event_responders(
    id, responder_id, started_at, ended_at, vehicle_plate, total_km,
    odometer_start, odometer_end, route, treatment_detail, emergency_means,
    treatment_notes, status,
    profile:profiles(full_name, callsign),
    treated:event_treated_vehicles(quantity, kind:vehicle_kinds(name))
  )
`

export async function fetchEventDetail(eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_DETAIL_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as EventDetail) ?? null
}

/** Hard-delete. RLS: admin only. Cascades event_responders + treated vehicles. */
export async function deleteEvent(
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) {
    return { ok: false, error: 'מחיקת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  return { ok: true }
}

export function ownParticipation(
  event: EventListItem,
  userId: string | undefined,
): ParticipationStatus | null {
  if (!userId) return null
  return event.responders.find((row) => row.responder_id === userId)?.status ?? null
}

export function doneFraction(event: EventListItem): string {
  const done = event.responders.filter((row) => row.status === 'done').length
  return `${done}/${event.responders.length}`
}

/** Unit-list text search ids (shift_lead+). Empty trimmed needle → []. */
export async function searchUnitEventIds(needle: string): Promise<string[]> {
  const variants = searchQueryVariants(needle)
  if (variants.length === 0) return []

  const batches = await Promise.all(
    variants.map(async (variant) => {
      const { data, error } = await supabase.rpc('search_unit_event_ids', {
        p_needle: variant,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as string[]
    }),
  )
  return [...new Set(batches.flat())]
}

export function filterUnitEventsForList(
  events: EventListItem[],
  opts: { status: EventStatus | 'all'; searchIds: ReadonlySet<string> | null },
): EventListItem[] {
  return events.filter((event) => {
    const matchesStatus = opts.status === 'all' || event.status === opts.status
    if (!matchesStatus) return false
    if (opts.searchIds === null) return true
    return opts.searchIds.has(event.id)
  })
}

export type MineEventBlock =
  | { key: string; kind: 'standalone'; event: EventListItem }
  | { key: string; kind: 'shift'; shiftId: string; title: string; events: EventListItem[] }

export function shiftGroupTitle(event: EventListItem): string {
  const shift = event.shift
  if (!shift) return 'משמרת'
  const kind = SHIFT_KIND_LABELS[shift.shift_kind]
  const vehicle = VEHICLE_TYPE_LABELS[shift.vehicle_type]
  const plate =
    shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
      ? formatPlate(shift.personal_vehicle.plate_number)
      : null
  const head = plate ? `${kind} · ${vehicle} · ${plate}` : `${kind} · ${vehicle}`
  return `${formatDate(shift.shift_date)} · ${head}`
}

export function groupMineEventCards(events: EventListItem[]): MineEventBlock[] {
  const blocks: MineEventBlock[] = []
  const shiftIndex = new Map<string, number>()
  for (const event of events) {
    if (event.origin === 'shift' && event.shift_id) {
      const existing = shiftIndex.get(event.shift_id)
      if (existing != null) {
        const block = blocks[existing]
        if (block?.kind === 'shift') block.events.push(event)
        continue
      }
      shiftIndex.set(event.shift_id, blocks.length)
      blocks.push({
        key: event.shift_id,
        kind: 'shift',
        shiftId: event.shift_id,
        title: shiftGroupTitle(event),
        events: [event],
      })
      continue
    }
    blocks.push({ key: event.id, kind: 'standalone', event })
  }
  return blocks
}
