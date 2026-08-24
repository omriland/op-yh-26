import type { ReportViewer } from './reports/types'
import type { EventStatus, ParticipationStatus } from './status'
import { supabase } from './supabase'

export type OpenDocumentationFillStatus = 'pending' | 'in_progress'

export type OpenDocumentationResponderSource = {
  responder_id: string
  status: ParticipationStatus
  profile: { full_name: string; callsign: string } | null
}

export type OpenDocumentationEventSource = {
  id: string
  event_date: string
  status: EventStatus
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
  shift_lead_id: string
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: OpenDocumentationResponderSource[]
}

export type OpenDocumentationRow = {
  id: string
  event_id: string
  event_date: string
  police_event_id: string | null
  responder_name: string | null
  responder_callsign: string | null
  shift_lead_name: string | null
  shift_lead_callsign: string | null
  road_name: string | null
  location: string | null
  fill_status: OpenDocumentationFillStatus
  frozen_over_60km: boolean
  frozen_suspicious_duplicate: boolean
}

const OPEN_EVENT_STATUSES = new Set<EventStatus>(['in_progress', 'partial'])
const OPEN_PARTICIPATION_STATUSES = new Set<ParticipationStatus>(['pending', 'in_progress'])

export function documentationFillLabel(status: OpenDocumentationFillStatus): string {
  return status === 'in_progress' ? 'נשמרה טיוטה' : 'טרם הוזן'
}

function responderSortKey(row: OpenDocumentationRow): string {
  return [row.responder_name ?? '', row.responder_callsign ?? ''].join(' ')
}

export function buildOpenDocumentationRows(
  events: OpenDocumentationEventSource[],
  opts: { from: string; to: string; viewer: ReportViewer },
): OpenDocumentationRow[] {
  const rows: OpenDocumentationRow[] = []

  for (const event of events) {
    if (!OPEN_EVENT_STATUSES.has(event.status)) continue
    if (event.is_cancelled) continue
    if (event.event_date < opts.from || event.event_date > opts.to) continue
    if (!opts.viewer.isAdmin && event.shift_lead_id !== opts.viewer.userId) continue

    for (const responder of event.responders) {
      if (!OPEN_PARTICIPATION_STATUSES.has(responder.status)) continue
      rows.push({
        id: `${event.id}:${responder.responder_id}`,
        event_id: event.id,
        event_date: event.event_date,
        police_event_id: event.police_event_id,
        responder_name: responder.profile?.full_name ?? null,
        responder_callsign: responder.profile?.callsign ?? null,
        shift_lead_name: event.shift_lead?.full_name ?? null,
        shift_lead_callsign: event.shift_lead?.callsign ?? null,
        road_name: event.road?.name ?? null,
        location: event.location,
        fill_status: responder.status === 'in_progress' ? 'in_progress' : 'pending',
        frozen_over_60km: Boolean(event.frozen_over_60km),
        frozen_suspicious_duplicate: Boolean(event.frozen_suspicious_duplicate),
      })
    }
  }

  rows.sort((a, b) => {
    const byDate = b.event_date.localeCompare(a.event_date)
    if (byDate !== 0) return byDate
    return responderSortKey(a).localeCompare(responderSortKey(b), 'he')
  })

  return rows
}

const OPEN_DOCUMENTATION_SELECT = `
  id,
  event_date,
  status,
  is_cancelled,
  police_event_id,
  location,
  frozen_over_60km,
  frozen_suspicious_duplicate,
  shift_lead_id,
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  responders:event_responders(
    responder_id,
    status,
    profile:profiles(full_name, callsign)
  )
`

export async function loadOpenDocumentationReport(
  from: string,
  to: string,
  viewer: ReportViewer,
): Promise<OpenDocumentationRow[]> {
  let query = supabase
    .from('events')
    .select(OPEN_DOCUMENTATION_SELECT)
    .in('status', ['in_progress', 'partial'])
    .eq('is_cancelled', false)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: false })

  if (!viewer.isAdmin) {
    query = query.eq('shift_lead_id', viewer.userId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return buildOpenDocumentationRows((data ?? []) as unknown as OpenDocumentationEventSource[], {
    from,
    to,
    viewer,
  })
}
