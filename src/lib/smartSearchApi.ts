import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { SMART_SEARCH_MAX_QUERY_CHARS } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { EVENT_LIST_SELECT, type EventListItem } from './events'
import { withResponderFreeze } from './responderFreezeSchema'
import { parseRules, type RulesVocab } from './search/searchRules'
import { canUseArchive, filterForRole, type DroppedKey, type SearchRole } from './search/searchRole'
import { searchQueryVariants } from './searchQuery'
import { jerusalemToday } from './shifts'
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
  actions: string
}

/** Phone, email, role and last activity come back for admins only (app_search). */
export type PersonHit = {
  id: string
  full_name: string
  callsign: string
  volunteer_status: string | null
  found_by?: string | null
  highest_role?: string | null
  last_active_at?: string | null
  phone?: string | null
  email?: string | null
  last_shift_date?: string | null
}

export type SearchLane = 'ai' | 'direct' | 'fallback' | 'rules'

/** Why sentence parsing did not run or failed; logged in smart_search_log.reason. */
export type ParseFailReason =
  | 'not_configured'
  | 'rate_limited'
  | 'timeout'
  | 'model_error'
  | 'refusal'
  | 'invalid_output'
  | 'network'

export type Interpretation = {
  filter: SmartSearchFilter
  lane: SearchLane
  /** Settles after the search starts; never rejects. */
  logId: Promise<string | null>
  error?: 'query_too_long'
  /** Set on the fallback lane. */
  reason?: ParseFailReason
}

export type SearchEvent = EventListItem & { found_by: string }
export type SearchResults = {
  events: SearchEvent[]
  archive: ArchiveRow[]
  people: PersonHit[]
  dropped: DroppedKey[]
}

export type InterpretOptions = {
  role: SearchRole
  vocab: RulesVocab
  /** Skip the rules lane (the panel's "פענוח המשפט" always asks the model). */
  forceModel?: boolean
  today?: string
}

/** The client deadline for the model lane. The function's own model timeout is 5 s. */
const INTERPRET_DEADLINE_MS = 6500

const PLATE_FIELDS = 'plate_number, model, manufacturer, sort_order'
const LIST_RESPONDER_PROFILE = 'profile:profiles(full_name, callsign, vehicles(archived))'

/**
 * The list select plus the treated plates the CSV export needs. A plate belongs to
 * either the event or one responder row (fill-born events keep theirs on the row).
 */
const SEARCH_EVENT_SELECT = `${EVENT_LIST_SELECT.replace(
  LIST_RESPONDER_PROFILE,
  `${LIST_RESPONDER_PROFILE},
    treated_plates:event_treated_plates!event_treated_plates_event_responder_id_fkey(${PLATE_FIELDS})`,
)},
  shared_plates:event_treated_plates!event_treated_plates_event_id_fkey(${PLATE_FIELDS})`

const HYDRATE_CHUNK = 100

const PARSE_FAIL_REASONS: readonly ParseFailReason[] = [
  'not_configured', 'rate_limited', 'timeout', 'model_error', 'refusal', 'invalid_output',
]

/** A log failure never fails the search. */
async function logLane(
  q: string,
  filter: SmartSearchFilter,
  lane: SearchLane,
  startedAt: number,
  reason: ParseFailReason | null = null,
) {
  try {
    const { data, error } = await supabase.rpc('app_search_log', {
      p_query: q,
      p_filter: filter,
      p_lane: lane,
      p_latency_ms: Date.now() - startedAt,
      p_reason: reason,
    })
    return error || typeof data !== 'string' ? null : data
  } catch {
    return null
  }
}

async function errorBody(error: unknown): Promise<{ status?: number; code?: string; logId?: string }> {
  const ctx = (error as { context?: Response }).context
  if (!ctx || typeof ctx.json !== 'function') return {}
  try {
    const body = (await ctx.json()) as { error?: string; logId?: string }
    return { status: ctx.status, code: body.error, logId: body.logId }
  } catch {
    return { status: ctx.status }
  }
}

/**
 * Query to filter. Lanes, cheapest first: direct (digits), rules (every word known),
 * the model (Claude Haiku 5.5 through the smart-search function), and fallback (the
 * words as text) when the model is not set up, slow, refuses or answers badly.
 */
export async function interpretQuery(q: string, options: InterpretOptions): Promise<Interpretation> {
  const startedAt = Date.now()
  const noLog = Promise.resolve(null)
  if (isBlankQuery(q)) return { filter: directFilter(q), lane: 'direct', logId: noLog }
  if (q.length > SMART_SEARCH_MAX_QUERY_CHARS) {
    return { filter: directFilter(q), lane: 'direct', logId: noLog, error: 'query_too_long' }
  }
  if (isDirectQuery(q)) {
    const filter = directFilter(q)
    return { filter, lane: 'direct', logId: logLane(q, filter, 'direct', startedAt) }
  }
  if (!options.forceModel) {
    const rules = parseRules(q, options.today ?? jerusalemToday(), options.vocab, options.role)
    if (rules.covered) {
      return { filter: rules.filter, lane: 'rules', logId: logLane(q, rules.filter, 'rules', startedAt) }
    }
  }

  // On the deadline the SDK aborts the request and returns an error, which falls back below.
  const { data, error } = await supabase.functions.invoke('smart-search', {
    body: { q },
    timeout: INTERPRET_DEADLINE_MS,
  })
  if (!error && data?.filter) {
    return {
      filter: data.filter as SmartSearchFilter,
      lane: 'ai',
      logId: Promise.resolve((data.logId as string | null) ?? null),
    }
  }
  const body = error ? await errorBody(error) : {}
  if (body.code === 'query_too_long') {
    return { filter: directFilter(q), lane: 'direct', logId: noLog, error: 'query_too_long' }
  }
  const reason: ParseFailReason = PARSE_FAIL_REASONS.includes(body.code as ParseFailReason)
    ? (body.code as ParseFailReason)
    : body.status
      ? 'model_error'
      : 'network'
  const filter = directFilter(q)
  // The function logs the attempts it makes; log here only what never reached it.
  const logId = body.logId ? Promise.resolve(body.logId) : logLane(q, filter, 'fallback', startedAt, reason)
  return { filter, lane: 'fallback', logId, reason }
}

type EventHit = { id: string; found_by: string }
type AppSearchReply = { events?: EventHit[]; people?: PersonHit[]; dropped?: string[] }

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

async function hydrateEvents(hits: EventHit[], select: string): Promise<SearchEvent[]> {
  const byId = new Map<string, EventListItem>()
  const ids = hits.map((h) => h.id)
  for (let i = 0; i < ids.length; i += HYDRATE_CHUNK) {
    const { data, error } = await supabase
      .from('events')
      .select(select)
      .in('id', ids.slice(i, i + HYDRATE_CHUNK))
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as unknown as EventListItem[]) byId.set(row.id, row)
  }
  return hits.flatMap((h) => {
    const row = byId.get(h.id)
    return row ? [{ ...row, found_by: h.found_by }] : []
  })
}

export type RunSearchOptions = {
  role: SearchRole
  /** The panel's typing session; the archive audits it once. Omit on the results page. */
  session?: string
}

/**
 * Runs a filter as the signed-in user. Events and people come from app_search (RLS);
 * the archive only for admins, and only when the filter wants it.
 */
export async function runSearch(
  input: SmartSearchFilter,
  limit: number,
  options: RunSearchOptions,
): Promise<SearchResults> {
  const { filter: f, dropped } = filterForRole(input, options.role)
  const filters = textOnly(f) ? searchQueryVariants(f.text!).map((text) => ({ ...f, text })) : [f]
  // The archive RPC writes an audit row, so skip it when the filter excludes the archive.
  const wantArchive = canUseArchive(options.role) && f.entity !== 'people' && f.source !== 'new'

  const results = await Promise.all(
    filters.map(async (filter) => {
      const [main, archive] = await Promise.all([
        rpcOrThrow<AppSearchReply>('app_search', { p_filter: filter, p_mode: 'full', p_limit: limit }),
        wantArchive
          ? rpcOrThrow<{ rows: ArchiveRow[] }>('app_search_archive', {
              p_filter: filter,
              p_session: options.session ?? null,
              p_limit: limit,
            })
          : Promise.resolve({ rows: [] as ArchiveRow[] }),
      ])
      return { main, archive }
    }),
  )

  // The second variant's tail can be dropped at the cap.
  const hits = mergeBy(results.map((r) => r.main.events ?? []), (e) => e.id).slice(0, limit)
  const archive = mergeBy(results.map((r) => r.archive.rows ?? []), (r) => r.event_fk).slice(0, limit)
  const people = mergeBy(results.map((r) => r.main.people ?? []), (p) => p.id).slice(0, limit)
  const events = await hydrateEvents(hits, await withResponderFreeze(SEARCH_EVENT_SELECT))
  return { events, archive, people, dropped }
}

export type Suggestions = { people: PersonHit[]; events: SearchEvent[] }

/**
 * The instant panel: 5 people and 5 events for what is typed so far. One or two
 * characters look up people only (name or או״ק prefix). Postgres only, no model.
 */
export async function suggest(q: string, role: SearchRole): Promise<Suggestions> {
  const text = q.trim()
  if (isBlankQuery(text)) return { people: [], events: [] }
  const peopleOnly = text.length <= 2 && !/^\d+$/.test(text)
  const variants = searchQueryVariants(text)
  const replies = await Promise.all(
    variants.map((variant) =>
      rpcOrThrow<AppSearchReply>('app_search', {
        p_filter: filterForRole(
          { intent: 'find', entity: peopleOnly ? 'people' : 'both', source: 'new', text: variant },
          role,
        ).filter,
        p_mode: 'suggest',
      }),
    ),
  )
  const people = mergeBy(replies.map((r) => r.people ?? []), (p) => p.id).slice(0, 5)
  const hits = mergeBy(replies.map((r) => r.events ?? []), (e) => e.id).slice(0, 5)
  const events = hits.length > 0 ? await hydrateEvents(hits, await withResponderFreeze(EVENT_LIST_SELECT)) : []
  return { people, events }
}

/** Five old-site reports for the panel. Admins only; one audit row per typing session. */
export async function suggestArchive(q: string, session: string): Promise<ArchiveRow[]> {
  const text = q.trim()
  if (text.replace(/\s/g, '').length < 3) return []
  const reply = await rpcOrThrow<{ rows: ArchiveRow[] }>('app_search_archive', {
    p_filter: { intent: 'find', entity: 'events', source: 'archive', text },
    p_session: session,
    p_limit: 5,
  })
  return reply.rows ?? []
}

/** Profiles a name in the filter can mean, as the caller can see them. */
export async function resolvePeople(name: string, role: SearchRole): Promise<PersonHit[]> {
  const reply = await rpcOrThrow<AppSearchReply>('app_search', {
    p_filter: filterForRole({ intent: 'find', entity: 'people', source: 'new', person: name }, role).filter,
    p_mode: 'full',
    p_limit: 20,
  })
  return reply.people ?? []
}

let vocabPromise: Promise<RulesVocab> | null = null

/** Active event types and districts, for the rules lane and the filter editors. */
export function fetchSearchVocab(): Promise<RulesVocab> {
  vocabPromise ??= Promise.all([
    supabase.from('event_types').select('name').eq('active', true).order('name'),
    supabase.from('districts').select('name').eq('active', true).order('name'),
  ])
    .then(([types, districts]) => {
      if (types.error || districts.error) throw new Error('vocab')
      return {
        eventTypes: (types.data ?? []).map((r: { name: string }) => r.name),
        districts: (districts.data ?? []).map((r: { name: string }) => r.name),
      }
    })
    .catch(() => {
      vocabPromise = null
      return { eventTypes: [], districts: [] }
    })
  return vocabPromise
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

/** The earliest new-system event date, for section order. Null when unknown. */
export async function fetchFirstNewEventDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from('events')
    .select('event_date')
    .eq('is_demo', false)
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data as { event_date: string }).event_date
}
