import { supabase } from './supabase'

export type EventsByResponderSource = {
  responder_id: string
  total_km: number | null
  profile: { full_name: string; callsign: string } | null
}

export type EventsByResponderEventSource = {
  id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
  event_type: { name: string } | null
  district: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: EventsByResponderSource[]
}

export type EventsByResponderRow = {
  id: string
  event_id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  event_type_name: string | null
  district_name: string | null
  road_name: string | null
  location: string | null
  shift_lead_name: string | null
  shift_lead_callsign: string | null
  total_km: number | null
  responder_id: string
  responder_name: string | null
  responder_callsign: string | null
  frozen_over_60km: boolean
  frozen_suspicious_duplicate: boolean
}

function responderSortKey(row: EventsByResponderRow): string {
  return [row.responder_name ?? '', row.responder_callsign ?? '', row.responder_id].join(' ')
}

/** Flatten events → one row per volunteer; sort name asc, then date desc. */
export function buildEventsByResponderRows(
  events: EventsByResponderEventSource[],
  range: { from: string; to: string },
): EventsByResponderRow[] {
  const rows: EventsByResponderRow[] = []

  for (const event of events) {
    if (event.event_date < range.from || event.event_date > range.to) continue
    for (const responder of event.responders) {
      rows.push({
        id: `${event.id}:${responder.responder_id}`,
        event_id: event.id,
        event_date: event.event_date,
        is_cancelled: event.is_cancelled,
        police_event_id: event.police_event_id,
        event_type_name: event.event_type?.name ?? null,
        district_name: event.district?.name ?? null,
        road_name: event.road?.name ?? null,
        location: event.location,
        shift_lead_name: event.shift_lead?.full_name ?? null,
        shift_lead_callsign: event.shift_lead?.callsign ?? null,
        total_km: responder.total_km,
        responder_id: responder.responder_id,
        responder_name: responder.profile?.full_name ?? null,
        responder_callsign: responder.profile?.callsign ?? null,
        frozen_over_60km: Boolean(event.frozen_over_60km),
        frozen_suspicious_duplicate: Boolean(event.frozen_suspicious_duplicate),
      })
    }
  }

  rows.sort((a, b) => {
    const byResponder = responderSortKey(a).localeCompare(responderSortKey(b), 'he')
    if (byResponder !== 0) return byResponder
    return b.event_date.localeCompare(a.event_date)
  })

  return rows
}

const EVENTS_BY_RESPONDER_SELECT = `
  id,
  event_date,
  is_cancelled,
  police_event_id,
  location,
  frozen_over_60km,
  frozen_suspicious_duplicate,
  event_type:event_types(name),
  district:districts(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  responders:event_responders(
    responder_id,
    total_km,
    profile:profiles(full_name, callsign)
  )
`

export async function loadEventsByResponderReport(
  from: string,
  to: string,
): Promise<EventsByResponderRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENTS_BY_RESPONDER_SELECT)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: false })

  if (error) throw new Error(error.message)
  return buildEventsByResponderRows((data ?? []) as unknown as EventsByResponderEventSource[], {
    from,
    to,
  })
}
