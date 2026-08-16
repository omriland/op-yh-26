import { searchQueryVariants } from './searchQuery'
import { supabase } from './supabase'
import type { EventStatus, ShiftStatus } from './status'

export type ShiftVehicleType = 'patrol_north' | 'patrol_center' | 'personal'

export type ShiftKind = 'morning' | 'midday' | 'reinforcement' | 'escort' | 'other'

export const VEHICLE_TYPE_LABELS: Record<ShiftVehicleType, string> = {
  patrol_north: 'ניידת צפון',
  patrol_center: 'ניידת מרכז',
  personal: 'רכב פרטי',
}

export const SHIFT_KIND_LABELS: Record<ShiftKind, string> = {
  morning: 'בוקר',
  midday: 'צהריים',
  reinforcement: 'תגבור',
  escort: 'ליווי',
  other: 'אחר',
}

export const SHIFT_KIND_OPTIONS: { value: ShiftKind; label: string }[] = [
  { value: 'morning', label: SHIFT_KIND_LABELS.morning },
  { value: 'midday', label: SHIFT_KIND_LABELS.midday },
  { value: 'reinforcement', label: SHIFT_KIND_LABELS.reinforcement },
  { value: 'escort', label: SHIFT_KIND_LABELS.escort },
  { value: 'other', label: SHIFT_KIND_LABELS.other },
]

export type ShiftResponderSummary = {
  id: string
  responder_id: string
}

export type ShiftLinkedEventSummary = {
  id: string
  event_id: string
}

export type ShiftBornEventSummary = {
  id: string
  event_date: string
  police_event_id: string | null
  status: EventStatus
  treatment_detail: string | null
  treatment_notes: string | null
  road_id: string | null
  location: string | null
  emergency_means: boolean
  event_type: { name: string } | null
  last_saved: { full_name: string } | null
  updated_at?: string
  treated: { id?: string; vehicle_kind_id?: string; quantity?: number }[]
}

export type ShiftListItem = {
  id: string
  shift_date: string
  shift_kind: ShiftKind
  vehicle_type: ShiftVehicleType
  status: ShiftStatus
  odometer_start: number | null
  odometer_end: number | null
  personal_vehicle: { plate_number: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: ShiftResponderSummary[]
  linked_events: ShiftLinkedEventSummary[]
  born_events: ShiftBornEventSummary[]
  last_saved: { full_name: string } | null
}

export const SHIFT_LIST_SELECT = `
  id,
  shift_date,
  shift_kind,
  vehicle_type,
  status,
  odometer_start,
  odometer_end,
  personal_vehicle:vehicles!shifts_personal_vehicle_id_fkey(plate_number),
  shift_lead:profiles!shifts_shift_lead_id_fkey(full_name, callsign),
  responders:shift_responders(id, responder_id),
  linked_events:shift_events(id, event_id),
  born_events:events!events_shift_id_fkey(
    id,
    event_date,
    police_event_id,
    status,
    treatment_detail,
    treatment_notes,
    road_id,
    location,
    emergency_means,
    event_type:event_types(name),
    last_saved:profiles!events_last_saved_by_fkey(full_name),
    treated:event_treated_vehicles!event_treated_vehicles_event_id_fkey(id)
  ),
  last_saved:profiles!shifts_last_saved_by_fkey(full_name)
`

/** Default window for the unit shifts table. Search can hydrate older rows. */
export const UNIT_SHIFTS_LIST_LIMIT = 200

export function unitShiftsListHint(limit: number): string {
  return `מציג את ${limit} המשמרות האחרונות. ניתן להשתמש בחיפוש לשליפת משמרות ישנות יותר`
}

export function missingSearchShiftIds(
  loadedIds: Iterable<string>,
  searchIds: ReadonlySet<string>,
): string[] {
  const loaded = new Set(loadedIds)
  return [...searchIds].filter((id) => !loaded.has(id))
}

export function mergeShiftLists(
  loaded: ShiftListItem[],
  extras: ShiftListItem[],
): ShiftListItem[] {
  const byId = new Map<string, ShiftListItem>()
  for (const shift of loaded) byId.set(shift.id, shift)
  for (const shift of extras) {
    if (!byId.has(shift.id)) byId.set(shift.id, shift)
  }
  return [...byId.values()].sort((a, b) => {
    if (a.shift_date !== b.shift_date) return a.shift_date < b.shift_date ? 1 : -1
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
}

export function filterUnitShiftsForList(
  shifts: ShiftListItem[],
  opts: { searchIds: ReadonlySet<string> | null },
): ShiftListItem[] {
  if (opts.searchIds === null) return shifts
  return shifts.filter((shift) => opts.searchIds!.has(shift.id))
}

/** Unit-wide list for shift-leads and admins; RLS narrows it for everyone else. */
export async function fetchShifts(opts?: { limit?: number }): Promise<ShiftListItem[]> {
  let query = supabase
    .from('shifts')
    .select(SHIFT_LIST_SELECT)
    .order('shift_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts?.limit != null) {
    query = query.limit(opts.limit)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ShiftListItem[]
}

const SHIFT_ID_CHUNK = 100

/** Hydrate unit-list rows for search hits that are outside the default window. */
export async function fetchShiftsByIds(ids: string[]): Promise<ShiftListItem[]> {
  if (ids.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += SHIFT_ID_CHUNK) {
    chunks.push(ids.slice(i, i + SHIFT_ID_CHUNK))
  }

  const rows: ShiftListItem[] = []
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('shifts')
      .select(SHIFT_LIST_SELECT)
      .in('id', chunk)
      .order('shift_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as unknown as ShiftListItem[]))
  }

  return mergeShiftLists([], rows)
}

/** Unit-list text search ids (shift_lead+). Empty trimmed needle → []. */
export async function searchUnitShiftIds(needle: string): Promise<string[]> {
  const variants = searchQueryVariants(needle)
  if (variants.length === 0) return []

  const batches = await Promise.all(
    variants.map(async (variant) => {
      const { data, error } = await supabase.rpc('search_unit_shift_ids', {
        p_needle: variant,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as string[]
    }),
  )
  return [...new Set(batches.flat())]
}

/** Shifts the viewer is assigned to as a responder. */
export async function fetchMyShifts(userId: string): Promise<ShiftListItem[]> {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('shift_responders')
    .select('shift_id')
    .eq('responder_id', userId)

  if (assignmentsError) throw new Error(assignmentsError.message)

  const shiftIds = (assignments ?? []).map((row) => row.shift_id as string)
  if (shiftIds.length === 0) return []

  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_LIST_SELECT)
    .in('id', shiftIds)
    .order('shift_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ShiftListItem[]
}

export type ShiftEventTypeCount = {
  id: string
  event_type_id: string
  count: number
  event_type: { name: string } | null
}

export type ShiftTreatedVehicleCount = {
  id: string
  vehicle_kind_id: string
  count: number
  vehicle_kind: { name: string } | null
}

export type ShiftLinkedEventDetail = {
  id: string
  event_id: string
  event: {
    event_date: string
    police_event_id: string | null
    is_cancelled: boolean
    event_type: { name: string } | null
  } | null
}

export type ShiftResponderDetail = ShiftResponderSummary & {
  profile: { full_name: string; callsign: string } | null
}

export type ShiftDetail = Omit<ShiftListItem, 'responders' | 'linked_events'> & {
  personal_vehicle_id: string | null
  total_km: number | null
  notes: string | null
  updated_at: string
  responders: ShiftResponderDetail[]
  linked_events: ShiftLinkedEventDetail[]
  event_type_counts: ShiftEventTypeCount[]
  treated_vehicle_counts: ShiftTreatedVehicleCount[]
}

const SHIFT_DETAIL_SELECT = `
  id,
  shift_date,
  shift_kind,
  vehicle_type,
  status,
  personal_vehicle_id,
  odometer_start,
  odometer_end,
  total_km,
  notes,
  updated_at,
  personal_vehicle:vehicles!shifts_personal_vehicle_id_fkey(plate_number),
  shift_lead:profiles!shifts_shift_lead_id_fkey(full_name, callsign),
  last_saved:profiles!shifts_last_saved_by_fkey(full_name),
  born_events:events!events_shift_id_fkey(
    id,
    event_date,
    police_event_id,
    status,
    treatment_detail,
    treatment_notes,
    road_id,
    location,
    emergency_means,
    updated_at,
    event_type:event_types(name),
    last_saved:profiles!events_last_saved_by_fkey(full_name),
    treated:event_treated_vehicles!event_treated_vehicles_event_id_fkey(vehicle_kind_id, quantity)
  ),
  responders:shift_responders(
    id,
    responder_id,
    profile:profiles(full_name, callsign)
  ),
  linked_events:shift_events(
    id,
    event_id,
    event:events(
      event_date,
      police_event_id,
      is_cancelled,
      event_type:event_types(name)
    )
  ),
  event_type_counts:shift_event_type_counts(
    id,
    event_type_id,
    count,
    event_type:event_types(name)
  ),
  treated_vehicle_counts:shift_treated_vehicle_counts(
    id,
    vehicle_kind_id,
    count,
    vehicle_kind:vehicle_kinds(name)
  )
`

export async function fetchShiftDetail(shiftId: string): Promise<ShiftDetail | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_DETAIL_SELECT)
    .eq('id', shiftId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as ShiftDetail) ?? null
}

/** YYYY-MM-DD in Asia/Jerusalem — same calendar as shift_date. */
export function jerusalemToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())
}

/** Assigned responders may edit on the shift date or later; future stays view-only. */
export function canEditShiftByDate(shiftDate: string): boolean {
  return shiftDate <= jerusalemToday()
}

export const SHIFT_TOO_EARLY_MESSAGE = 'ניתן לערוך החל מתאריך המשמרת'

/** Lead/admin may document any date; responders only on/after the shift date. */
export function canDocumentShift(input: {
  shiftDate: string
  canManageLead: boolean
  today?: string
}): boolean {
  if (input.canManageLead) return true
  return !isShiftFuture(input.shiftDate, input.today)
}

export function isShiftFuture(
  shiftDate: string,
  today: string = jerusalemToday(),
): boolean {
  return shiftDate > today
}

/** Past/today shift still missing an odometer — same rule as the nav attention dot. */
export function isShiftPendingLog(
  shift: { shift_date: string; odometer_start: number | null; odometer_end: number | null },
  today: string = jerusalemToday(),
): boolean {
  return (
    !isShiftFuture(shift.shift_date, today) &&
    (shift.odometer_start == null || shift.odometer_end == null)
  )
}
