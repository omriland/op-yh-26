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

/** Extra KM that is not an event participation (private-vehicle shift). */
export type FuelRefundKmCredit = {
  responder_id: string
  total_km: number
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
  credits: FuelRefundKmCredit[] = [],
): FuelRefundRow[] {
  // Only rows where the shift-lead entered kilometers — event/participation status ignored.
  const withKm = participations.filter((row) => row.total_km != null)

  const byUser = new Map<string, FuelRefundParticipation[]>()
  for (const row of withKm) {
    const list = byUser.get(row.responder_id)
    if (list) list.push(row)
    else byUser.set(row.responder_id, [row])
  }

  const extraByUser = new Map<string, number>()
  for (const credit of credits) {
    extraByUser.set(credit.responder_id, (extraByUser.get(credit.responder_id) ?? 0) + credit.total_km)
  }

  const rows: FuelRefundRow[] = profiles.map((profile) => {
    const parts = byUser.get(profile.id) ?? []
    const total_km =
      parts.reduce((sum, p) => sum + (p.total_km ?? 0), 0) + (extraByUser.get(profile.id) ?? 0)
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
      events!inner(created_at, origin)
    `,
    )
    .eq('events.origin', 'manual')
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

export async function fetchPersonalShiftKmCredits(
  from: string,
  to: string,
): Promise<FuelRefundKmCredit[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('total_km, personal_vehicle_id, vehicles!shifts_personal_vehicle_id_fkey(user_id)')
    .eq('vehicle_type', 'personal')
    .not('total_km', 'is', null)
    .not('personal_vehicle_id', 'is', null)
    .gte('shift_date', from)
    .lte('shift_date', to)

  if (error) throw new Error(error.message)

  const credits: FuelRefundKmCredit[] = []
  for (const row of data ?? []) {
    const vehicle = row.vehicles as { user_id: string } | { user_id: string }[] | null
    const ownerId = Array.isArray(vehicle) ? vehicle[0]?.user_id : vehicle?.user_id
    if (!ownerId || row.total_km == null) continue
    credits.push({ responder_id: ownerId, total_km: Number(row.total_km) })
  }
  return credits
}

export async function loadFuelRefundReport(
  from: string,
  to: string,
): Promise<FuelRefundRow[]> {
  const [profiles, participations, credits] = await Promise.all([
    fetchActiveFuelRefundProfiles(),
    fetchParticipationsReportedInRange(from, to),
    fetchPersonalShiftKmCredits(from, to),
  ])
  return buildFuelRefundRows(profiles, participations, credits)
}
