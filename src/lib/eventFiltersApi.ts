import { fetchShiftLeadUsers } from './eventForm'
import {
  mergeRuleHits,
  ruleQueryPlans,
  type FilterRule,
  type QueryFilter,
  type RuleHit,
  type RuleQueryPlan,
} from './eventFilters'
import { fetchEventsByIds, type EventListItem } from './events'
import type { EventStatus } from './status'
import { supabase } from './supabase'

const ID_CHUNK = 100

type Filterable<Q> = {
  eq(column: string, value: string): Q
  neq(column: string, value: string): Q
  ilike(column: string, pattern: string): Q
  gte(column: string, value: string): Q
  lte(column: string, value: string): Q
  in(column: string, values: string[]): Q
  or(filters: string, options: { referencedTable: string }): Q
}

function applyFilter<Q extends Filterable<Q>>(query: Q, filter: QueryFilter): Q {
  switch (filter.op) {
    case 'in':
      return query.in(filter.column, filter.value)
    case 'or':
      return query.or(filter.filters, { referencedTable: filter.referencedTable })
    default:
      return query[filter.op](filter.column, filter.value)
  }
}

async function runPlan(plan: RuleQueryPlan, limit: number, ids?: string[]): Promise<RuleHit[]> {
  let query = supabase
    .from('events')
    .select(plan.select)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  for (const filter of plan.filters) query = applyFilter(query, filter)
  if (ids) query = query.in('id', ids)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RuleHit[]).map((row) => ({
    id: row.id,
    event_date: row.event_date,
    created_at: row.created_at,
  }))
}

type RuleQueryOpts = {
  shiftLeadId: string | null
  status: EventStatus | 'all'
  hideShiftEvents: boolean
  limit: number
  ids?: string[]
}

async function ruleHits(
  rules: readonly FilterRule[],
  opts: RuleQueryOpts,
): Promise<{ ids: string[]; capped: boolean }> {
  const plans = ruleQueryPlans(rules, opts)
  if (opts.ids) {
    if (opts.ids.length === 0) return { ids: [], capped: false }
    const chunks: string[][] = []
    for (let i = 0; i < opts.ids.length; i += ID_CHUNK) chunks.push(opts.ids.slice(i, i + ID_CHUNK))
    const lists = await Promise.all(
      plans.flatMap((plan) => chunks.map((chunk) => runPlan(plan, chunk.length, chunk))),
    )
    return { ids: mergeRuleHits(lists, opts.ids.length).ids, capped: false }
  }
  const lists = await Promise.all(plans.map((plan) => runPlan(plan, opts.limit)))
  return mergeRuleHits(lists, opts.limit)
}

/**
 * Unit-list rows that match every rule, newest first, capped at `limit`. With
 * `ids` it only checks those events (search hits outside the loaded rows).
 */
export async function fetchRuleFilteredEvents(
  rules: readonly FilterRule[],
  opts: RuleQueryOpts,
): Promise<{ events: EventListItem[]; capped: boolean }> {
  const hits = await ruleHits(rules, opts)
  const events = await fetchEventsByIds(hits.ids)
  return { events, capped: hits.capped }
}

/** Which of these already-loaded events match: ids only, no rows (האירועים שלי). */
export async function fetchRuleMatchingIds(rules: readonly FilterRule[], ids: string[]): Promise<string[]> {
  const hits = await ruleHits(rules, {
    shiftLeadId: null,
    status: 'all',
    hideShiftEvents: false,
    limit: ids.length,
    ids,
  })
  return hits.ids
}

export type FilterLookups = {
  shiftLeads: { id: string; label: string }[]
  vehicleKinds: { id: string; label: string }[]
}

/** Options for אחמ״ש and סוג רכב. Archived kinds stay: old events still use them. */
export async function fetchFilterLookups(): Promise<FilterLookups> {
  // The lead list answers only for leads and admins; a responder gets nothing or an
  // error, and האירועים שלי then offers the leads on their own events instead.
  const [leads, kinds] = await Promise.all([
    fetchShiftLeadUsers().catch(() => []),
    supabase
      .from('vehicle_kinds')
      .select('id, name')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ])
  if (kinds.error) throw new Error(kinds.error.message)
  return {
    shiftLeads: leads.map((lead) => ({
      id: lead.id,
      label: lead.callsign ? `${lead.full_name} · ${lead.callsign}` : lead.full_name,
    })),
    vehicleKinds: ((kinds.data ?? []) as { id: string; name: string }[]).map((kind) => ({
      id: kind.id,
      label: kind.name,
    })),
  }
}
