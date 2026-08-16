import type { ParticipationStatus } from './status'
import { supabase } from './supabase'

export type KmDiscrepancyResponderSource = {
  id: string
  responder_id: string
  status: ParticipationStatus
  total_km: number | null
  odometer_start: number | null
  odometer_end: number | null
  profile: { full_name: string; callsign: string } | null
}

export type KmDiscrepancyEventSource = {
  id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: KmDiscrepancyResponderSource[]
}

export type KmDiscrepancyRow = {
  id: string
  assignment_id: string
  event_id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  road_name: string | null
  responder_name: string | null
  responder_callsign: string | null
  shift_lead_name: string | null
  shift_lead_callsign: string | null
  lead_km: number
  responder_km: number
  diff: number
}

export type LeadKmReplacement =
  | { status: 'replace'; totalKm: number }
  | { status: 'already_aligned' }
  | { status: 'invalid' }

export function responderKm(start: number | null, end: number | null): number | null {
  if (start == null || end == null) return null
  return end - start
}

export function policeEventLabel(policeEventId: string | null, isCancelled: boolean): string {
  if (isCancelled) return policeEventId ? `בוטל · ${policeEventId}` : 'בוטל'
  return policeEventId || '—'
}

function responderSortKey(row: KmDiscrepancyRow): string {
  return [row.responder_name ?? '', row.responder_callsign ?? ''].join(' ')
}

export function resolveLeadKmReplacement(input: {
  total_km: number | null
  odometer_start: number | null
  odometer_end: number | null
}): LeadKmReplacement {
  const next = responderKm(input.odometer_start, input.odometer_end)
  if (input.total_km == null || next == null) return { status: 'invalid' }
  if (next === input.total_km) return { status: 'already_aligned' }
  return { status: 'replace', totalKm: next }
}

export function buildKmDiscrepancyRows(
  events: KmDiscrepancyEventSource[],
  range: { from: string; to: string },
): KmDiscrepancyRow[] {
  const rows: KmDiscrepancyRow[] = []

  for (const event of events) {
    if (event.event_date < range.from || event.event_date > range.to) continue
    for (const responder of event.responders) {
      if (responder.status !== 'done') continue
      if (responder.total_km == null) continue
      const volunteerKm = responderKm(responder.odometer_start, responder.odometer_end)
      if (volunteerKm == null || volunteerKm === responder.total_km) continue
      rows.push({
        id: `${event.id}:${responder.id}`,
        assignment_id: responder.id,
        event_id: event.id,
        event_date: event.event_date,
        is_cancelled: event.is_cancelled,
        police_event_id: event.police_event_id,
        location: event.location,
        road_name: event.road?.name ?? null,
        responder_name: responder.profile?.full_name ?? null,
        responder_callsign: responder.profile?.callsign ?? null,
        shift_lead_name: event.shift_lead?.full_name ?? null,
        shift_lead_callsign: event.shift_lead?.callsign ?? null,
        lead_km: responder.total_km,
        responder_km: volunteerKm,
        diff: volunteerKm - responder.total_km,
      })
    }
  }

  rows.sort((a, b) => {
    const byDate = b.event_date.localeCompare(a.event_date)
    if (byDate !== 0) return byDate
    const byAbs = Math.abs(b.diff) - Math.abs(a.diff)
    if (byAbs !== 0) return byAbs
    return responderSortKey(a).localeCompare(responderSortKey(b), 'he')
  })

  return rows
}

const KM_DISCREPANCY_SELECT = `
  id,
  event_date,
  is_cancelled,
  police_event_id,
  location,
  road:roads(name),
  shift_lead:profiles(full_name, callsign),
  responders:event_responders(
    id,
    responder_id,
    status,
    total_km,
    odometer_start,
    odometer_end,
    profile:profiles(full_name, callsign)
  )
`

export async function loadKmDiscrepancyReport(from: string, to: string): Promise<KmDiscrepancyRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(KM_DISCREPANCY_SELECT)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: false })

  if (error) throw new Error(error.message)
  return buildKmDiscrepancyRows((data ?? []) as unknown as KmDiscrepancyEventSource[], { from, to })
}

export async function applyLeadKmFromOdometer(assignmentId: string): Promise<'replaced' | 'already_aligned'> {
  const { data, error } = await supabase
    .from('event_responders')
    .select('id, total_km, odometer_start, odometer_end')
    .eq('id', assignmentId)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'missing assignment')

  const resolved = resolveLeadKmReplacement({
    total_km: data.total_km,
    odometer_start: data.odometer_start,
    odometer_end: data.odometer_end,
  })
  if (resolved.status === 'invalid') throw new Error('invalid odometer replacement')
  if (resolved.status === 'already_aligned') return 'already_aligned'

  const { data: updated, error: updateError } = await supabase
    .from('event_responders')
    .update({ total_km: resolved.totalKm, updated_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .select('id')
    .maybeSingle()

  if (updateError) throw new Error(updateError.message)
  if (!updated) throw new Error('update blocked')
  return 'replaced'
}
