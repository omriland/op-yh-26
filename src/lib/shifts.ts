import { supabase } from './supabase'
import type { ShiftStatus } from './status'

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

export type ShiftListItem = {
  id: string
  shift_date: string
  shift_kind: ShiftKind
  vehicle_type: ShiftVehicleType
  status: ShiftStatus
  personal_vehicle: { plate_number: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: ShiftResponderSummary[]
  linked_events: ShiftLinkedEventSummary[]
}

const SHIFT_LIST_SELECT = `
  id,
  shift_date,
  shift_kind,
  vehicle_type,
  status,
  personal_vehicle:vehicles(plate_number),
  shift_lead:profiles(full_name, callsign),
  responders:shift_responders(id, responder_id),
  linked_events:shift_events(id, event_id)
`

/** Unit-wide list for shift-leads and admins; RLS narrows it for everyone else. */
export async function fetchShifts(): Promise<ShiftListItem[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_LIST_SELECT)
    .order('shift_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ShiftListItem[]
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
  odometer_start: number | null
  odometer_end: number | null
  total_km: number | null
  notes: string | null
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
  personal_vehicle:vehicles(plate_number),
  shift_lead:profiles(full_name, callsign),
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
