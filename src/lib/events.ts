import { isMissingBusLaneColumn, isMissingEventTypeDetailColumn } from './eventForm'
import { addCalendarDays } from './mineListSections'
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
import { mapTreatedPlateRows, type TreatedPlate } from './treatedPlates'
import { EVENT_SECONDARY_LEADS_EMBED } from './eventShiftLeads'

export type EventResponderSummary = {
  id: string
  responder_id: string
  status: ParticipationStatus
  fill_completable_at?: string | null
  total_km: number | null
  started_at: string | null
  ended_at: string | null
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
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
  district: { name: string } | null
  event_type: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  secondary_leads?: unknown
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
  frozen_over_60km,
  frozen_suspicious_duplicate,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  ${EVENT_SECONDARY_LEADS_EMBED},
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
    fill_completable_at,
    total_km,
    started_at,
    ended_at,
    profile:profiles(full_name, callsign)
  )
`

/** Fetch cap for the unit events table. Search can hydrate older rows. */
export const UNIT_EVENTS_LIST_LIMIT = 200

/** Default visible window on אירועים. Load-more expands by this many days. */
export const UNIT_EVENTS_WINDOW_DAYS = 30

export const UNIT_EVENTS_RECENT_EMPTY_TITLE = 'לא נמצאו אירועים מ-30 הימים האחרונים'

export const UNIT_EVENTS_LOAD_MORE_LABEL = 'טען עוד'

export function unitEventsListHint(days: number): string {
  return `מציג אירועים מ-${days} הימים האחרונים. ניתן להשתמש בחיפוש לשליפת אירועים ישנים יותר`
}

export function compareEventsByDateDesc(
  a: { event_date: string; id: string },
  b: { event_date: string; id: string },
): number {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortEventsByDateDesc<T extends { event_date: string; id: string }>(events: T[]): T[] {
  return [...events].sort(compareEventsByDateDesc)
}

export function unitEventsWindowStart(today: string, windowsLoaded: number): string {
  const windows = Math.max(1, windowsLoaded)
  return addCalendarDays(today, -(windows * UNIT_EVENTS_WINDOW_DAYS))
}

export function partitionUnitEventsByWindow<T>(
  events: T[],
  opts: { dateOf: (event: T) => string; today: string; windowsLoaded: number },
): { visible: T[]; hasMore: boolean } {
  const start = unitEventsWindowStart(opts.today, opts.windowsLoaded)
  const visible: T[] = []
  let hasMore = false
  for (const event of events) {
    if (opts.dateOf(event) >= start) visible.push(event)
    else hasMore = true
  }
  visible.sort((a, b) => {
    const left = opts.dateOf(a)
    const right = opts.dateOf(b)
    if (left !== right) return left < right ? 1 : -1
    return 0
  })
  return { visible, hasMore }
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
  return [...byId.values()].sort(compareEventsByDateDesc)
}

/** Unit-wide list for shift-leads and admins; RLS narrows it for everyone else. */
export async function fetchEvents(opts?: {
  limit?: number
  shiftLeadId?: string | null
}): Promise<EventListItem[]> {
  let query = supabase
    .from('events')
    .select(EVENT_LIST_SELECT)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.shiftLeadId) {
    query = query.eq('shift_lead_id', opts.shiftLeadId)
  }

  if (opts?.limit != null) {
    query = query.limit(opts.limit)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EventListItem[]
}

const EVENT_ID_CHUNK = 100

/** Hydrate unit-list rows for search hits that are outside the default window. */
export async function fetchEventsByIds(
  ids: string[],
  opts?: { shiftLeadId?: string | null },
): Promise<EventListItem[]> {
  if (ids.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += EVENT_ID_CHUNK) {
    chunks.push(ids.slice(i, i + EVENT_ID_CHUNK))
  }

  const rows: EventListItem[] = []
  for (const chunk of chunks) {
    let query = supabase
      .from('events')
      .select(EVENT_LIST_SELECT)
      .in('id', chunk)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (opts?.shiftLeadId) {
      query = query.eq('shift_lead_id', opts.shiftLeadId)
    }
    const { data, error } = await query

    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as unknown as EventListItem[]))
  }

  return mergeEventLists([], rows)
}

/**
 * Cap on the viewer's already-documented events. Open assignments are never
 * capped — they are the responder's outstanding obligations, and dropping one
 * would hide work the volunteer still owes. The archive is what gets a window.
 */
export const MINE_LOGGED_FETCH_LIMIT = 200

/** Events the viewer is assigned to as a responder. */
export async function fetchMyEvents(userId: string): Promise<EventListItem[]> {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('event_responders')
    .select('event_id, status')
    .eq('responder_id', userId)

  if (assignmentsError) throw new Error(assignmentsError.message)

  const rows = assignments ?? []
  const openIds: string[] = []
  const doneIds: string[] = []
  for (const row of rows) {
    const id = row.event_id as string
    if ((row.status as string) === 'done') doneIds.push(id)
    else openIds.push(id)
  }

  if (openIds.length === 0 && doneIds.length === 0) return []

  // Two queries so the cap lands only on the archive. A single capped query
  // ordered by date would silently drop an old event the responder still owes.
  const [open, logged] = await Promise.all([
    openIds.length === 0
      ? Promise.resolve([])
      : fetchEventsByIds(openIds),
    doneIds.length === 0
      ? Promise.resolve([])
      : (async () => {
          const { data, error } = await supabase
            .from('events')
            .select(EVENT_LIST_SELECT)
            .in('id', doneIds)
            .order('event_date', { ascending: false })
            .limit(MINE_LOGGED_FETCH_LIMIT)
          if (error) throw new Error(error.message)
          return (data ?? []) as unknown as EventListItem[]
        })(),
  ])

  return mergeEventLists(open, logged)
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
  treated_plates: TreatedPlate[]
}

export type EventDetail = Omit<EventListItem, 'responders'> & {
  notes: string | null
  event_type_detail: string | null
  bus_lane: boolean
  road_id: string | null
  location_lat: number | null
  location_lng: number | null
  location_pin_source: string | null
  updated_at: string
  responders: EventResponderDetail[]
  /** Event-keyed plates (shift-born). Alias from PostgREST `shared_plates`. */
  treated_plates: TreatedPlate[]
  shared_plates?: TreatedPlate[]
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
  location_pin_source,
  notes,
  event_type_detail,
  bus_lane,
  status,
  is_cancelled,
  origin,
  shift_id,
  treatment_detail,
  treatment_notes,
  emergency_means,
  updated_at,
  frozen_over_60km,
  frozen_suspicious_duplicate,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  ${EVENT_SECONDARY_LEADS_EMBED},
  last_saved:profiles!events_last_saved_by_fkey(full_name),
  shift:shifts!events_shift_id_fkey(
    shift_date,
    shift_kind,
    vehicle_type,
    personal_vehicle:vehicles!shifts_personal_vehicle_id_fkey(plate_number)
  ),
  shared_treated:event_treated_vehicles!event_treated_vehicles_event_id_fkey(id),
  shared_plates:event_treated_plates!event_treated_plates_event_id_fkey(plate_number, model, color, left_where, manufacturer, logo_slug, sort_order),
  responders:event_responders(
    id, responder_id, started_at, ended_at, vehicle_plate, total_km,
    odometer_start, odometer_end, route, treatment_detail, emergency_means,
    treatment_notes, status,
    profile:profiles(full_name, callsign),
    treated:event_treated_vehicles(quantity, kind:vehicle_kinds(name)),
    treated_plates:event_treated_plates!event_treated_plates_event_responder_id_fkey(plate_number, model, color, left_where, manufacturer, logo_slug, sort_order)
  )
`

const EVENT_DETAIL_SELECT_NO_PLATES = `
  id,
  event_date,
  police_event_id,
  patrol_callsign,
  location,
  road_id,
  location_lat,
  location_lng,
  location_pin_source,
  notes,
  event_type_detail,
  bus_lane,
  status,
  is_cancelled,
  origin,
  shift_id,
  treatment_detail,
  treatment_notes,
  emergency_means,
  updated_at,
  frozen_over_60km,
  frozen_suspicious_duplicate,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  ${EVENT_SECONDARY_LEADS_EMBED},
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

type EventDetailRaw = Omit<EventDetail, 'treated_plates' | 'responders' | 'shared_plates'> & {
  shared_plates?: {
    plate_number: string | null
    model: string | null
    color: string | null
    left_where: string | null
    manufacturer: string | null
    logo_slug: string | null
    sort_order: number | null
  }[]
  responders: (Omit<EventResponderDetail, 'treated_plates'> & {
    treated_plates?: {
      plate_number: string | null
      model: string | null
      color: string | null
      left_where: string | null
      manufacturer: string | null
      logo_slug: string | null
      sort_order: number | null
    }[]
  })[]
}

function normalizeEventDetail(raw: EventDetailRaw): EventDetail {
  const treated_plates = mapTreatedPlateRows(raw.shared_plates)
  return {
    ...raw,
    event_type_detail: raw.event_type_detail ?? null,
    bus_lane: Boolean(raw.bus_lane),
    treated_plates,
    shared_plates: treated_plates,
    responders: (raw.responders ?? []).map((responder) => ({
      ...responder,
      treated_plates: mapTreatedPlateRows(responder.treated_plates),
    })),
  }
}

export async function fetchEventDetail(eventId: string): Promise<EventDetail | null> {
  let { data, error } = await supabase
    .from('events')
    .select(EVENT_DETAIL_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (error && (isMissingBusLaneColumn(error) || isMissingEventTypeDetailColumn(error))) {
    const retry = await supabase
      .from('events')
      .select(EVENT_DETAIL_SELECT.replace(/\n  event_type_detail,/, '').replace(/\n  bus_lane,/, ''))
      .eq('id', eventId)
      .maybeSingle()
    data = retry.data as typeof data
    error = retry.error
  }

  if (error) {
    if (/event_treated_plates|could not find|relationship/i.test(error.message)) {
      return fetchEventDetailWithPlateQueries(eventId)
    }
    throw new Error(error.message)
  }
  if (!data) return null
  return normalizeEventDetail(data as unknown as EventDetailRaw)
}

async function fetchEventDetailWithPlateQueries(eventId: string): Promise<EventDetail | null> {
  let { data, error } = await supabase
    .from('events')
    .select(EVENT_DETAIL_SELECT_NO_PLATES)
    .eq('id', eventId)
    .maybeSingle()

  if (error && (isMissingBusLaneColumn(error) || isMissingEventTypeDetailColumn(error))) {
    const retry = await supabase
      .from('events')
      .select(
        EVENT_DETAIL_SELECT_NO_PLATES.replace(/\n  event_type_detail,/, '').replace(
          /\n  bus_lane,/,
          '',
        ),
      )
      .eq('id', eventId)
      .maybeSingle()
    data = retry.data as typeof data
    error = retry.error
  }

  if (error) throw new Error(error.message)
  if (!data) return null

  const base = data as unknown as EventDetailRaw
  const responderIds = (base.responders ?? []).map((row) => row.id)

  const [{ data: sharedRows, error: sharedError }, { data: responderRows, error: responderError }] =
    await Promise.all([
      supabase
        .from('event_treated_plates')
        .select('plate_number, model, color, left_where, manufacturer, logo_slug, sort_order')
        .eq('event_id', eventId)
        .order('sort_order'),
      responderIds.length > 0
        ? supabase
            .from('event_treated_plates')
            .select('event_responder_id, plate_number, model, color, left_where, manufacturer, logo_slug, sort_order')
            .in('event_responder_id', responderIds)
            .order('sort_order')
        : Promise.resolve({ data: [] as {
            event_responder_id: string
            plate_number: string | null
            model: string | null
            color: string | null
            left_where: string | null
            manufacturer: string | null
            logo_slug: string | null
            sort_order: number | null
          }[], error: null }),
    ])

  if (sharedError) throw new Error(sharedError.message)
  if (responderError) throw new Error(responderError.message)

  type ResponderPlateRow = {
    event_responder_id: string
    plate_number: string | null
    model: string | null
    color: string | null
    left_where: string | null
    manufacturer: string | null
    logo_slug: string | null
    sort_order: number | null
  }
  const byResponder = new Map<string, ResponderPlateRow[]>()
  for (const row of (responderRows ?? []) as ResponderPlateRow[]) {
    const key = row.event_responder_id
    const list = byResponder.get(key) ?? []
    list.push(row)
    byResponder.set(key, list)
  }

  return normalizeEventDetail({
    ...base,
    shared_plates: sharedRows ?? [],
    responders: (base.responders ?? []).map((responder) => ({
      ...responder,
      treated_plates: byResponder.get(responder.id) ?? [],
    })),
  })
}

export const EVENT_DELETE_FAILED = 'מחיקת האירוע נכשלה. בדקו את החיבור ונסו שוב.'
export const EVENT_DELETE_OTHER_LEAD = 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.'

export function viewerMayDeleteOthersEvents(roles: readonly string[]): boolean {
  return roles.includes('admin') || roles.includes('super_admin')
}

/** Unit Events list right-click delete — Super Admin only, not regular admin. */
export function canUseEventListDeleteContext(roles: readonly string[]): boolean {
  return roles.includes('super_admin')
}

export function eventDeleteConfirmTitle(policeEventId: string | null | undefined): string {
  const id = policeEventId?.trim()
  return id ? `למחוק את האירוע ${id}?` : 'למחוק את האירוע?'
}

/** Admin/super_admin: any event. Shift-lead: only events they created (`shift_lead_id`). */
export function canViewerDeleteEvent(input: {
  roles: readonly string[]
  userId: string | undefined
  shiftLeadId: string | null | undefined
}): boolean {
  if (!input.userId) return false
  if (viewerMayDeleteOthersEvents(input.roles)) return true
  if (!input.roles.includes('shift_lead')) return false
  return Boolean(input.shiftLeadId) && input.shiftLeadId === input.userId
}

/** Hard-delete. RLS: admin, or owning shift-lead on a recent event with no responders. Cascades children. */
export async function deleteEvent(
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .select('id')
    .maybeSingle()
  if (!error && data) return { ok: true }

  const [{ data: remaining }, { data: sessionData }] = await Promise.all([
    supabase.from('events').select('shift_lead_id').eq('id', eventId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const userId = sessionData.user?.id
  if (remaining && userId && remaining.shift_lead_id !== userId) {
    return { ok: false, error: EVENT_DELETE_OTHER_LEAD }
  }
  return { ok: false, error: EVENT_DELETE_FAILED }
}

export async function approveEventFreeze(
  eventId: string,
  reason: 'over_60km' | 'suspicious_duplicate',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('approve_event_freeze', {
    p_event_id: eventId,
    p_reason: reason,
  })
  if (error) {
    return { ok: false, error: 'אישור האירוע נכשל. בדקו את החיבור ונסו שוב.' }
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

export function ownFillCompletableAt(
  event: EventListItem,
  userId: string | undefined,
): string | null {
  if (!userId) return null
  return event.responders.find((row) => row.responder_id === userId)?.fill_completable_at ?? null
}

export function doneFraction(event: EventListItem): string {
  const done = event.responders.filter((row) => row.status === 'done').length
  return `${done}/${event.responders.length}`
}

/** Unit-list text search ids (shift_lead+). Empty trimmed needle → []. */
export async function searchUnitEventIds(
  needle: string,
  opts?: { shiftLeadId?: string | null },
): Promise<string[]> {
  const variants = searchQueryVariants(needle)
  if (variants.length === 0) return []

  const batches = await Promise.all(
    variants.map(async (variant) => {
      const params: { p_needle: string; p_shift_lead_id?: string } = {
        p_needle: variant,
      }
      if (opts?.shiftLeadId) params.p_shift_lead_id = opts.shiftLeadId
      const first = await supabase.rpc('search_unit_event_ids', params)
      if (!first.error) return (first.data ?? []) as string[]
      if (!params.p_shift_lead_id) throw new Error(first.error.message)
      const fallback = await supabase.rpc('search_unit_event_ids', {
        p_needle: variant,
      })
      if (fallback.error) throw new Error(fallback.error.message)
      return (fallback.data ?? []) as string[]
    }),
  )
  return [...new Set(batches.flat())]
}

export function filterUnitEventsForList(
  events: EventListItem[],
  opts: { status: EventStatus | 'all'; searchIds: ReadonlySet<string> | null },
): EventListItem[] {
  return sortEventsByDateDesc(
    events.filter((event) => {
      const matchesStatus = opts.status === 'all' || event.status === opts.status
      if (!matchesStatus) return false
      if (opts.searchIds === null) return true
      return opts.searchIds.has(event.id)
    }),
  )
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
  return `משמרת · ${formatDate(shift.shift_date)} · ${head}`
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
