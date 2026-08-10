import { supabase } from './supabase'
import type { EventStatus, ParticipationStatus } from './status'

export type EventResponderSummary = {
  id: string
  responder_id: string
  status: ParticipationStatus
}

export type EventListItem = {
  id: string
  event_date: string
  police_event_id: string | null
  patrol_callsign: string | null
  location: string | null
  status: EventStatus
  is_cancelled: boolean
  district: { name: string } | null
  event_type: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: EventResponderSummary[]
}

const EVENT_LIST_SELECT = `
  id,
  event_date,
  police_event_id,
  patrol_callsign,
  location,
  status,
  is_cancelled,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles(full_name, callsign),
  responders:event_responders(id, responder_id, status)
`

/** Unit-wide list for shift-leads and admins; RLS narrows it for everyone else. */
export async function fetchEvents(): Promise<EventListItem[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_LIST_SELECT)
    .order('event_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EventListItem[]
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
  responders: EventResponderDetail[]
}

const EVENT_DETAIL_SELECT = `
  id,
  event_date,
  police_event_id,
  patrol_callsign,
  location,
  notes,
  status,
  is_cancelled,
  district:districts(name),
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles(full_name, callsign),
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
