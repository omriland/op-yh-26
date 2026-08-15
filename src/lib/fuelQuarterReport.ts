import { includeEventInFuelAllocation } from './fuelAllocationPolicy'
import { supabase } from './supabase'
import { localDateRangeToUtcBounds } from './fuelRefundReport'
import type { EventStatus } from './status'
import {
  defaultFuelQuarter,
  litersFromPayableKm,
  monthKmBuckets,
  payableKm,
  quarterLocalDateRange,
  quarterMonthLabels,
  remainingKm,
  suggestedCards,
  type MonthKmBuckets,
} from './fuelQuarterMath'

export type FuelQuarterStatus = 'draft' | 'locked'

export type FuelQuarterProfile = {
  id: string
  full_name: string
  callsign: string
  active: boolean
}

export type FuelQuarterParticipation = {
  responder_id: string
  created_at: string
  total_km: number | null
}

export type SavedDistribution = {
  cards: number
  card_numbers: string
}

export type FuelQuarterRow = {
  responder_id: string
  full_name: string
  callsign: string
  active: boolean
  opening_balance_km: number
  km_month_1: number
  km_month_2: number
  km_month_3: number
  quarter_km: number
  payable_km: number
  liters: number
  suggested_cards: number
  cards: number
  remaining_km: number
  card_numbers: string
}

export type FuelQuarterWorkbook = {
  quarterId: string
  year: number
  quarter: 1 | 2 | 3 | 4
  status: FuelQuarterStatus
  monthLabels: [string, string, string]
  rows: FuelQuarterRow[]
}

export function buildFuelQuarterRows(input: {
  year: number
  quarter: 1 | 2 | 3 | 4
  profiles: FuelQuarterProfile[]
  participations: FuelQuarterParticipation[]
  openingByUser: Record<string, number>
  savedByUser: Record<string, SavedDistribution>
}): FuelQuarterRow[] {
  const byUser = new Map<string, FuelQuarterParticipation[]>()
  for (const p of input.participations) {
    const list = byUser.get(p.responder_id) ?? []
    list.push(p)
    byUser.set(p.responder_id, list)
  }

  const profileById = new Map(input.profiles.map((p) => [p.id, p]))
  const ids = new Set<string>()

  for (const id of byUser.keys()) ids.add(id)
  for (const [id, opening] of Object.entries(input.openingByUser)) {
    if (opening !== 0) ids.add(id)
  }
  for (const id of Object.keys(input.savedByUser)) ids.add(id)

  const rows: FuelQuarterRow[] = []

  for (const id of ids) {
    const profile = profileById.get(id)
    if (!profile) continue

    const buckets: MonthKmBuckets = monthKmBuckets(
      input.year,
      input.quarter,
      byUser.get(id) ?? [],
    )
    const opening = input.openingByUser[id] ?? 0
    const quarter_km = buckets.km_month_1 + buckets.km_month_2 + buckets.km_month_3
    const saved = input.savedByUser[id]

    if (opening === 0 && quarter_km === 0 && !saved) continue

    const payable = payableKm(opening, buckets)
    const suggested = suggestedCards(payable)
    const cards = saved ? saved.cards : suggested
    const card_numbers = saved?.card_numbers ?? ''

    rows.push({
      responder_id: id,
      full_name: profile.full_name,
      callsign: profile.callsign,
      active: profile.active,
      opening_balance_km: opening,
      km_month_1: buckets.km_month_1,
      km_month_2: buckets.km_month_2,
      km_month_3: buckets.km_month_3,
      quarter_km,
      payable_km: payable,
      liters: litersFromPayableKm(payable),
      suggested_cards: suggested,
      cards,
      remaining_km: remainingKm(payable, cards),
      card_numbers,
    })
  }

  rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))
  return rows
}

export { defaultFuelQuarter, quarterMonthLabels }

async function ensureFuelQuarter(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<{ id: string; status: FuelQuarterStatus }> {
  const { data: existing, error: selectError } = await supabase
    .from('fuel_quarters')
    .select('id, status')
    .eq('year', year)
    .eq('quarter', quarter)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)
  if (existing) {
    return { id: existing.id as string, status: existing.status as FuelQuarterStatus }
  }

  const { data: created, error: insertError } = await supabase
    .from('fuel_quarters')
    .insert({ year, quarter, status: 'draft' })
    .select('id, status')
    .single()

  if (insertError) throw new Error(insertError.message)
  return { id: created.id as string, status: created.status as FuelQuarterStatus }
}

async function fetchOpeningByUser(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<Record<string, number>> {
  const prev =
    quarter === 1
      ? { year: year - 1, quarter: 4 as const }
      : { year, quarter: (quarter - 1) as 1 | 2 | 3 | 4 }

  const { data: prevQuarter, error } = await supabase
    .from('fuel_quarters')
    .select('id, status')
    .eq('year', prev.year)
    .eq('quarter', prev.quarter)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!prevQuarter || prevQuarter.status !== 'locked') return {}

  const { data: dists, error: distError } = await supabase
    .from('fuel_quarter_distributions')
    .select('responder_id, remaining_km')
    .eq('quarter_id', prevQuarter.id)

  if (distError) throw new Error(distError.message)

  const opening: Record<string, number> = {}
  for (const row of dists ?? []) {
    opening[row.responder_id as string] = Number(row.remaining_km)
  }
  return opening
}

async function fetchParticipationsInQuarter(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<FuelQuarterParticipation[]> {
  const { from, to } = quarterLocalDateRange(year, quarter)
  const { startIso, endIso } = localDateRangeToUtcBounds(from, to)

  const { data, error } = await supabase
    .from('event_responders')
    .select(
      `
      responder_id,
      total_km,
      events!inner(created_at, status)
    `,
    )
    .eq('events.status', 'done')
    .not('total_km', 'is', null)
    .gte('events.created_at', startIso)
    .lte('events.created_at', endIso)

  if (error) throw new Error(error.message)

  type Row = {
    responder_id: string
    total_km: number | null
    events: { created_at: string; status: EventStatus } | { created_at: string; status: EventStatus }[]
  }

  return ((data ?? []) as Row[]).flatMap((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events
    if (!event || !includeEventInFuelAllocation(event.status)) return []
    return [
      {
        responder_id: row.responder_id,
        total_km: row.total_km,
        created_at: event.created_at,
      },
    ]
  })
}

async function fetchProfilesByIds(ids: string[]): Promise<FuelQuarterProfile[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, callsign, active')
    .in('id', ids)

  if (error) throw new Error(error.message)
  return (data ?? []) as FuelQuarterProfile[]
}

async function fetchSavedDistributions(
  quarterId: string,
): Promise<Record<string, SavedDistribution>> {
  const { data, error } = await supabase
    .from('fuel_quarter_distributions')
    .select('responder_id, cards, card_numbers')
    .eq('quarter_id', quarterId)

  if (error) throw new Error(error.message)

  const saved: Record<string, SavedDistribution> = {}
  for (const row of data ?? []) {
    saved[row.responder_id as string] = {
      cards: Number(row.cards),
      card_numbers: (row.card_numbers as string) ?? '',
    }
  }
  return saved
}

export async function loadFuelQuarterWorkbook(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<FuelQuarterWorkbook> {
  const q = await ensureFuelQuarter(year, quarter)
  const [openingByUser, participations, savedByUser] = await Promise.all([
    fetchOpeningByUser(year, quarter),
    fetchParticipationsInQuarter(year, quarter),
    fetchSavedDistributions(q.id),
  ])

  const idSet = new Set<string>([
    ...participations.map((p) => p.responder_id),
    ...Object.keys(openingByUser),
    ...Object.keys(savedByUser),
  ])
  const profiles = await fetchProfilesByIds([...idSet])

  const rows = buildFuelQuarterRows({
    year,
    quarter,
    profiles,
    participations,
    openingByUser,
    savedByUser,
  })

  return {
    quarterId: q.id,
    year,
    quarter,
    status: q.status,
    monthLabels: quarterMonthLabels(quarter),
    rows,
  }
}

export async function saveFuelQuarterDraft(
  workbook: FuelQuarterWorkbook,
  rows: FuelQuarterRow[],
): Promise<void> {
  if (workbook.status === 'locked') throw new Error('הרבעון נעול')

  const payload = rows.map((row) => ({
    quarter_id: workbook.quarterId,
    responder_id: row.responder_id,
    opening_balance_km: row.opening_balance_km,
    km_month_1: row.km_month_1,
    km_month_2: row.km_month_2,
    km_month_3: row.km_month_3,
    quarter_km: row.quarter_km,
    cards: row.cards,
    card_numbers: row.card_numbers,
    remaining_km: remainingKm(row.payable_km, row.cards),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('fuel_quarter_distributions').upsert(payload, {
    onConflict: 'quarter_id,responder_id',
  })
  if (error) throw new Error(error.message)
}

export async function lockFuelQuarter(
  workbook: FuelQuarterWorkbook,
  rows: FuelQuarterRow[],
  lockedBy: string,
): Promise<void> {
  if (workbook.status === 'locked') throw new Error('הרבעון כבר נעול')

  await saveFuelQuarterDraft(workbook, rows)

  const { error } = await supabase
    .from('fuel_quarters')
    .update({
      status: 'locked',
      locked_at: new Date().toISOString(),
      locked_by: lockedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workbook.quarterId)

  if (error) throw new Error(error.message)
}
