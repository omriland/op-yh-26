import { supabase } from './supabase'
import { localDateRangeToUtcBounds } from './fuelRefundReport'

/** Flattened source row before / after filter (may still have null km). */
export type FuelDetailSource = {
  event_id: string
  responder_id: string
  total_km: number | null
  started_at: string | null
  created_at: string
  location: string | null
  notes: string | null
  event_type_name: string | null
  full_name: string
  callsign: string
  frozen?: boolean
}

export type FuelDetailRow = {
  id: string
  event_id: string
  responder_id: string
  total_km: number
  started_at: string | null
  created_at: string
  location: string | null
  notes: string | null
  event_type_name: string | null
  full_name: string
  callsign: string
}

/** Filter to lead-entered km; sort created_at desc, then callsign asc. */
export function buildFuelDetailRows(sources: FuelDetailSource[]): FuelDetailRow[] {
  const rows: FuelDetailRow[] = []

  for (const src of sources) {
    if (src.total_km == null || src.frozen) continue
    rows.push({
      id: `${src.event_id}:${src.responder_id}`,
      event_id: src.event_id,
      responder_id: src.responder_id,
      total_km: src.total_km,
      started_at: src.started_at,
      created_at: src.created_at,
      location: src.location,
      notes: src.notes,
      event_type_name: src.event_type_name,
      full_name: src.full_name,
      callsign: src.callsign,
    })
  }

  rows.sort((a, b) => {
    const byCreated = b.created_at.localeCompare(a.created_at)
    if (byCreated !== 0) return byCreated
    return a.callsign.localeCompare(b.callsign, 'he')
  })

  return rows
}

type DetailQueryRow = {
  responder_id: string
  event_id: string
  total_km: number | null
  started_at: string | null
  events:
    | {
        created_at: string
        location: string | null
        notes: string | null
        event_type: { name: string } | { name: string }[] | null
        frozen_over_60km?: boolean
        frozen_suspicious_duplicate?: boolean
      }
    | {
        created_at: string
        location: string | null
        notes: string | null
        event_type: { name: string } | { name: string }[] | null
        frozen_over_60km?: boolean
        frozen_suspicious_duplicate?: boolean
      }[]
  profile:
    | { full_name: string; callsign: string }
    | { full_name: string; callsign: string }[]
    | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function eventTypeName(
  eventType: { name: string } | { name: string }[] | null | undefined,
): string | null {
  const row = one(eventType)
  return row?.name ?? null
}

/**
 * Participations on events reported in the local date range.
 * Filter `total_km` in the builder so zero remains included when present.
 */
export async function fetchFuelDetailSources(
  from: string,
  to: string,
): Promise<FuelDetailSource[]> {
  const { startIso, endIso } = localDateRangeToUtcBounds(from, to)
  const { data, error } = await supabase
    .from('event_responders')
    .select(
      `
      responder_id,
      event_id,
      total_km,
      started_at,
      events!inner(
        created_at,
        location,
        notes,
        frozen_over_60km,
        frozen_suspicious_duplicate,
        event_type:event_types(name)
      ),
      profile:profiles(full_name, callsign)
    `,
    )
    .not('total_km', 'is', null)
    .gte('events.created_at', startIso)
    .lte('events.created_at', endIso)

  if (error) throw new Error(error.message)

  return ((data ?? []) as DetailQueryRow[]).map((row) => {
    const event = one(row.events)
    const profile = one(row.profile)
    return {
      event_id: row.event_id,
      responder_id: row.responder_id,
      total_km: row.total_km,
      started_at: row.started_at,
      created_at: event?.created_at ?? '',
      location: event?.location ?? null,
      notes: event?.notes ?? null,
      event_type_name: eventTypeName(event?.event_type),
      full_name: profile?.full_name ?? '',
      callsign: profile?.callsign ?? '',
      frozen: Boolean(event?.frozen_over_60km || event?.frozen_suspicious_duplicate),
    }
  })
}

export async function loadFuelDetailReport(
  from: string,
  to: string,
): Promise<FuelDetailRow[]> {
  const sources = await fetchFuelDetailSources(from, to)
  return buildFuelDetailRows(sources)
}
