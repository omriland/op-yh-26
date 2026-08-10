import { supabase } from './supabase'

export type FuelRefundProfile = {
  id: string
  full_name: string
  callsign: string
}

/** Participation km for refunds — only lead-entered `total_km` counts. */
export type FuelRefundParticipation = {
  responder_id: string
  event_id: string
  total_km: number | null
}

export type FuelRefundRow = {
  id: string
  full_name: string
  callsign: string
  total_km: number
  event_count: number
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** Local calendar YYYY-MM-DD. */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Default range: 1st of current month → today (local). */
export function defaultFuelRefundRange(now: Date = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: toLocalDateString(from), to: toLocalDateString(now) }
}

export function isValidFuelRefundRange(from: string, to: string): boolean {
  if (!from || !to) return false
  return from <= to
}

/** Inclusive local-day bounds as UTC ISO for filtering `events.created_at`. */
export function localDateRangeToUtcBounds(
  from: string,
  to: string,
): { startIso: string; endIso: string } {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const start = new Date(fy!, fm! - 1, fd!, 0, 0, 0, 0)
  const end = new Date(ty!, tm! - 1, td!, 23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function buildFuelRefundRows(
  profiles: FuelRefundProfile[],
  participations: FuelRefundParticipation[],
): FuelRefundRow[] {
  // Only rows where the shift-lead entered kilometers — event/participation status ignored.
  const withKm = participations.filter((row) => row.total_km != null)

  const byUser = new Map<string, FuelRefundParticipation[]>()
  for (const row of withKm) {
    const list = byUser.get(row.responder_id)
    if (list) list.push(row)
    else byUser.set(row.responder_id, [row])
  }

  const rows: FuelRefundRow[] = profiles.map((profile) => {
    const parts = byUser.get(profile.id) ?? []
    const total_km = parts.reduce((sum, p) => sum + (p.total_km ?? 0), 0)
    return {
      id: profile.id,
      full_name: profile.full_name,
      callsign: profile.callsign,
      total_km,
      event_count: parts.length,
    }
  })

  rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))
  return rows
}

export async function fetchActiveFuelRefundProfiles(): Promise<FuelRefundProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, callsign')
    .eq('active', true)

  if (error) throw new Error(error.message)
  return (data ?? []) as FuelRefundProfile[]
}

type ParticipationQueryRow = {
  responder_id: string
  event_id: string
  total_km: number | null
}

/**
 * Responder rows on events reported (created) in the local date range where the
 * shift-lead entered `total_km`. No filter on event status, participation status,
 * or cancelled — having lead-entered km is enough.
 */
export async function fetchParticipationsReportedInRange(
  from: string,
  to: string,
): Promise<FuelRefundParticipation[]> {
  const { startIso, endIso } = localDateRangeToUtcBounds(from, to)
  const { data, error } = await supabase
    .from('event_responders')
    .select(
      `
      responder_id,
      event_id,
      total_km,
      events!inner(created_at)
    `,
    )
    .not('total_km', 'is', null)
    .gte('events.created_at', startIso)
    .lte('events.created_at', endIso)

  if (error) throw new Error(error.message)

  return ((data ?? []) as ParticipationQueryRow[]).map((row) => ({
    responder_id: row.responder_id,
    event_id: row.event_id,
    total_km: row.total_km,
  }))
}

export async function loadFuelRefundReport(
  from: string,
  to: string,
): Promise<FuelRefundRow[]> {
  const [profiles, participations] = await Promise.all([
    fetchActiveFuelRefundProfiles(),
    fetchParticipationsReportedInRange(from, to),
  ])
  return buildFuelRefundRows(profiles, participations)
}
