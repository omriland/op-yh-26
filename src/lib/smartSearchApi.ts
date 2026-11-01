import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { SMART_SEARCH_MAX_QUERY_CHARS } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { EVENT_LIST_SELECT, type EventListItem } from './events'
import { searchQueryVariants } from './searchQuery'
import { directFilter, isBlankQuery, isDirectQuery } from './smartSearch'
import { supabase } from './supabase'

export type ArchiveRow = {
  event_fk: string
  event_date: string
  event_number: string | null
  road: string | null
  location: string | null
  people: string
  cars: string
  damage: string
  found_by: string
}

export type PersonHit = {
  id: string
  full_name: string
  callsign: string
  highest_role: string
  volunteer_status: string | null
  last_active_at: string | null
}

export type Interpretation = {
  filter: SmartSearchFilter
  lane: 'ai' | 'direct' | 'fallback'
  logId: string | null
  error?: 'query_too_long'
}

/** The list select plus the treated plates the CSV export needs. */
const SEARCH_EVENT_SELECT = `${EVENT_LIST_SELECT},
  shared_plates:event_treated_plates!event_treated_plates_event_id_fkey(plate_number, model, manufacturer, sort_order)`

const HYDRATE_CHUNK = 100

/** A log failure never fails the search. */
async function logLane(q: string, filter: SmartSearchFilter, lane: 'direct' | 'fallback', startedAt: number) {
  try {
    const { data, error } = await supabase.rpc('log_smart_search', {
      p_query: q,
      p_filter: filter,
      p_lane: lane,
      p_latency_ms: Date.now() - startedAt,
    })
    return error || typeof data !== 'string' ? null : data
  } catch {
    return null
  }
}

async function errorCode(error: unknown): Promise<{ status?: number; code?: string }> {
  const ctx = (error as { context?: Response }).context
  if (!ctx) return {}
  try {
    const body = (await ctx.json()) as { error?: string }
    return { status: ctx.status, code: body.error }
  } catch {
    return { status: ctx.status }
  }
}

/**
 * Blank query: nothing is invoked or logged; returns the direct shape with a null
 * logId (the page checks isBlankQuery first anyway).
 */
export async function interpretQuery(q: string): Promise<Interpretation> {
  const startedAt = Date.now()
  if (isBlankQuery(q)) return { filter: directFilter(q), lane: 'direct', logId: null }
  if (q.length > SMART_SEARCH_MAX_QUERY_CHARS) {
    return { filter: directFilter(q), lane: 'direct', logId: null, error: 'query_too_long' }
  }
  if (isDirectQuery(q)) {
    const filter = directFilter(q)
    return { filter, lane: 'direct', logId: await logLane(q, filter, 'direct', startedAt) }
  }

  const { data, error } = await supabase.functions.invoke('smart-search', { body: { q } })
  if (!error && data?.filter) {
    return { filter: data.filter as SmartSearchFilter, lane: 'ai', logId: (data.logId as string | null) ?? null }
  }
  if (error && (await errorCode(error)).code === 'query_too_long') {
    return { filter: directFilter(q), lane: 'direct', logId: null, error: 'query_too_long' }
  }
  const filter = directFilter(q)
  return { filter, lane: 'fallback', logId: await logLane(q, filter, 'fallback', startedAt) }
}

type EventHit = { id: string; found_by: string }

function textOnly(f: SmartSearchFilter): boolean {
  const { intent: _i, entity: _e, source: _s, text, ...rest } = f
  return Boolean(text) && Object.values(rest).every((v) => v === undefined)
}

function mergeBy<T>(lists: T[][], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  return lists.flat().filter((row) => {
    const k = key(row)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function rpcOrThrow<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function runSearch(
  f: SmartSearchFilter,
  limit: number,
): Promise<{ events: (EventListItem & { found_by: string })[]; archive: ArchiveRow[]; people: PersonHit[] }> {
  const filters = textOnly(f) ? searchQueryVariants(f.text!).map((text) => ({ ...f, text })) : [f]
  // The archive RPC writes an audit row per call, so skip it when the filter excludes the archive.
  const wantArchive = f.entity !== 'people' && f.source !== 'new'

  const results = await Promise.all(
    filters.map(async (filter) => {
      const [main, archive] = await Promise.all([
        rpcOrThrow<{ events: EventHit[]; people: PersonHit[] }>('admin_search', { p_filter: filter, p_limit: limit }),
        wantArchive
          ? rpcOrThrow<{ rows: ArchiveRow[] }>('admin_search_archive', { p_filter: filter, p_limit: limit })
          : Promise.resolve({ rows: [] as ArchiveRow[] }),
      ])
      return { main, archive }
    }),
  )

  const hits = mergeBy(results.map((r) => r.main.events ?? []), (e) => e.id).slice(0, limit)
  const archive = mergeBy(results.map((r) => r.archive.rows ?? []), (r) => r.event_fk).slice(0, limit)
  const people = mergeBy(results.map((r) => r.main.people ?? []), (p) => p.id).slice(0, limit)

  const byId = new Map<string, EventListItem>()
  const ids = hits.map((h) => h.id)
  for (let i = 0; i < ids.length; i += HYDRATE_CHUNK) {
    const { data, error } = await supabase
      .from('events')
      .select(SEARCH_EVENT_SELECT)
      .in('id', ids.slice(i, i + HYDRATE_CHUNK))
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as unknown as EventListItem[]) byId.set(row.id, row)
  }
  const events = hits.flatMap((h) => {
    const row = byId.get(h.id)
    return row ? [{ ...row, found_by: h.found_by }] : []
  })

  return { events, archive, people }
}

export async function reportCounts(
  logId: string,
  counts: { events: number; archive: number; people: number },
): Promise<void> {
  await supabase.rpc('set_smart_search_log_counts', {
    p_id: logId,
    p_events: counts.events,
    p_archive: counts.archive,
    p_people: counts.people,
  })
}

export async function reportChipRemoved(logId: string): Promise<void> {
  await supabase.rpc('mark_smart_search_chip_removed', { p_id: logId })
}
