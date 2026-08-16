import { supabase } from './supabase'
import type { ParticipationStatus } from './status'

export const KM_EXCEPTION_THRESHOLD = 60

export type KmExceptionResponderSource = {
  status: ParticipationStatus
  total_km: number | null
  profile: { full_name: string; callsign: string } | null
}

export type KmExceptionEventSource = {
  id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  event_type: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: KmExceptionResponderSource[]
}

export type KmExceptionRow = {
  event_id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  event_type_name: string | null
  road_name: string | null
  shift_lead_name: string | null
  shift_lead_callsign: string | null
  responder_name: string | null
  responder_callsign: string | null
  total_km: number
}

/** Flatten events → exceptional responder rows; sort date desc, then km desc. */
export function buildKmExceptionRows(
  events: KmExceptionEventSource[],
  range?: { from: string; to: string },
): KmExceptionRow[] {
  const rows: KmExceptionRow[] = []

  for (const event of events) {
    if (range && (event.event_date < range.from || event.event_date > range.to)) continue
    for (const responder of event.responders) {
      // Lead-entered km only (`event_responders.total_km`). Participation
      // status does not matter — odometer fields are never used here.
      if (responder.total_km == null || responder.total_km < KM_EXCEPTION_THRESHOLD) continue

      rows.push({
        event_id: event.id,
        event_date: event.event_date,
        is_cancelled: event.is_cancelled,
        police_event_id: event.police_event_id,
        location: event.location,
        event_type_name: event.event_type?.name ?? null,
        road_name: event.road?.name ?? null,
        shift_lead_name: event.shift_lead?.full_name ?? null,
        shift_lead_callsign: event.shift_lead?.callsign ?? null,
        responder_name: responder.profile?.full_name ?? null,
        responder_callsign: responder.profile?.callsign ?? null,
        total_km: responder.total_km,
      })
    }
  }

  rows.sort((a, b) => {
    const byDate = b.event_date.localeCompare(a.event_date)
    if (byDate !== 0) return byDate
    return b.total_km - a.total_km
  })

  return rows
}

const KM_EXCEPTION_SELECT = `
  id,
  event_date,
  is_cancelled,
  police_event_id,
  location,
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  responders:event_responders(
    status,
    total_km,
    profile:profiles(full_name, callsign)
  )
`

export async function fetchKmExceptionRows(from?: string, to?: string): Promise<KmExceptionRow[]> {
  let query = supabase
    .from('events')
    .select(KM_EXCEPTION_SELECT)
    .order('event_date', { ascending: false })

  if (from) query = query.gte('event_date', from)
  if (to) query = query.lte('event_date', to)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return buildKmExceptionRows(
    (data ?? []) as unknown as KmExceptionEventSource[],
    from && to ? { from, to } : undefined,
  )
}
