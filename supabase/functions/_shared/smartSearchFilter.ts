export type SmartSearchIntent = 'find' | 'export' | 'unsupported_question'
export type SmartSearchEntity = 'events' | 'people' | 'both'
export type SmartSearchSource = 'new' | 'archive' | 'both'
export type VolunteerStatusValue =
  | 'administration'
  | 'basic_training'
  | 'phone_training'
  | 'personal_vehicle_training'
  | 'shifts_only'
  | 'active_volunteer'

export type SmartSearchFilter = {
  intent: SmartSearchIntent
  entity: SmartSearchEntity
  source: SmartSearchSource
  date_from?: string
  date_to?: string
  police_event_id?: string
  road?: string
  location_text?: string
  event_type?: string
  district?: string
  plate?: string
  vehicle_text?: string
  person?: string
  person_role?: 'responder' | 'lead' | 'any'
  text?: string
  status?: 'draft' | 'in_progress' | 'partial' | 'done'
  include_cancelled?: boolean
  damaged?: boolean
  damage_location?: string
  volunteer_status?: VolunteerStatusValue
  no_shift_from?: string
  no_shift_to?: string
  /** Set by the app after it resolves `person` to profiles; never by the model. */
  person_ids?: string[]
  /** The resolved profiles' או״ק, for the old-site archive (admins). Never by the model. */
  person_callsigns?: string[]
}
export type SmartSearchVocab = { eventTypes: string[]; districts: string[]; hitTypes: string[] }

/** The keys the parser fills. person_ids and person_callsigns come from the app. */
export const SMART_SEARCH_FILTER_KEYS = [
  'intent', 'entity', 'source', 'date_from', 'date_to', 'police_event_id', 'road',
  'location_text', 'event_type', 'district', 'plate', 'vehicle_text', 'person',
  'person_role', 'text', 'status', 'include_cancelled', 'damaged', 'damage_location',
  'volunteer_status', 'no_shift_from', 'no_shift_to',
] as const satisfies readonly (keyof SmartSearchFilter)[]
export const SMART_SEARCH_MAX_QUERY_CHARS = 300

const INTENTS = ['find', 'export', 'unsupported_question']
const ENTITIES = ['events', 'people', 'both']
const SOURCES = ['new', 'archive', 'both']
const PERSON_ROLES = ['responder', 'lead', 'any']
const STATUSES = ['draft', 'in_progress', 'partial', 'done']
export const VOLUNTEER_STATUS_VALUES: readonly VolunteerStatusValue[] = [
  'administration', 'basic_training', 'phone_training', 'personal_vehicle_training', 'shifts_only', 'active_volunteer',
]
const MAX_STRING_CHARS = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PERSON_IDS = 50

function cleanString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().slice(0, MAX_STRING_CHARS)
  return s === '' ? undefined : s
}

function cleanDate(v: unknown): string | undefined {
  const s = cleanString(v)
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const ok = t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
  return ok ? s : undefined
}

function oneOf(v: unknown, allowed: readonly string[]): string | undefined {
  return typeof v === 'string' && allowed.includes(v) ? v : undefined
}

function orderedRange(from?: string, to?: string): [string | undefined, string | undefined] {
  return from && to && from > to ? [to, from] : [from, to]
}

/**
 * Untrusted input (the model's JSON, a URL, a saved chip) to a filter. Unknown keys,
 * wrong types and values outside the closed lists are dropped; the word stays in text
 * only if the model put it there.
 */
export function validateSmartSearchFilter(raw: unknown, vocab: SmartSearchVocab): SmartSearchFilter {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const f: SmartSearchFilter = {
    intent: (oneOf(r.intent, INTENTS) ?? 'find') as SmartSearchIntent,
    entity: (oneOf(r.entity, ENTITIES) ?? 'both') as SmartSearchEntity,
    source: (oneOf(r.source, SOURCES) ?? 'both') as SmartSearchSource,
  }

  const [from, to] = orderedRange(cleanDate(r.date_from), cleanDate(r.date_to))
  if (from) f.date_from = from
  if (to) f.date_to = to

  for (const k of ['police_event_id', 'road', 'location_text', 'vehicle_text', 'person', 'text'] as const) {
    const s = cleanString(r[k])
    if (s) f[k] = s
  }

  const eventType = oneOf(cleanString(r.event_type), vocab.eventTypes)
  if (eventType) f.event_type = eventType
  const district = oneOf(cleanString(r.district), vocab.districts)
  if (district) f.district = district
  const damageLocation = oneOf(cleanString(r.damage_location), vocab.hitTypes)
  if (damageLocation) f.damage_location = damageLocation

  if (typeof r.plate === 'string') {
    const digits = r.plate.replace(/\D/g, '').slice(0, MAX_STRING_CHARS)
    if (digits.length >= 3) f.plate = digits
  }

  const role = oneOf(r.person_role, PERSON_ROLES)
  if (role) f.person_role = role as SmartSearchFilter['person_role']
  const status = oneOf(r.status, STATUSES)
  if (status) f.status = status as SmartSearchFilter['status']
  const volunteerStatus = oneOf(r.volunteer_status, VOLUNTEER_STATUS_VALUES)
  if (volunteerStatus) f.volunteer_status = volunteerStatus as VolunteerStatusValue

  // One day of shift coverage when only one end is given.
  let [noFrom, noTo] = orderedRange(cleanDate(r.no_shift_from), cleanDate(r.no_shift_to))
  noFrom ??= noTo
  noTo ??= noFrom
  if (noFrom && noTo) {
    f.no_shift_from = noFrom
    f.no_shift_to = noTo
  }

  // false is the parser's empty value, the same as leaving the flag out.
  if (r.include_cancelled === true) f.include_cancelled = true
  if (r.damaged === true) f.damaged = true

  if (Array.isArray(r.person_ids)) {
    const ids = [...new Set(r.person_ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))]
    if (ids.length > 0) f.person_ids = ids.slice(0, MAX_PERSON_IDS)
  }
  if (Array.isArray(r.person_callsigns)) {
    const signs = [
      ...new Set(
        r.person_callsigns
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim().slice(0, 40))
          .filter(Boolean),
      ),
    ]
    if (signs.length > 0) f.person_callsigns = signs.slice(0, MAX_PERSON_IDS)
  }

  return f
}

/**
 * The structured-output schema for the parser (Claude `output_config.format`).
 * Every key is required and none is a union: structured outputs allow at most 16
 * union-typed parameters, and optional keys make the grammar grow until the API
 * answers "Schema is too complex" (19 optional keys took 144 s to fail). So an
 * unused string is "" and an unused flag is false, both of which
 * validateSmartSearchFilter reads as absent. Closed lists carry "" as their empty
 * value.
 */
export function smartSearchJsonSchema(vocab: SmartSearchVocab): Record<string, unknown> {
  const str = { type: 'string' }
  const bool = { type: 'boolean' }
  const list = (values: readonly string[]) => ({ type: 'string', enum: ['', ...values] })
  const properties: Record<(typeof SMART_SEARCH_FILTER_KEYS)[number], unknown> = {
    intent: { type: 'string', enum: INTENTS },
    entity: { type: 'string', enum: ENTITIES },
    source: { type: 'string', enum: SOURCES },
    date_from: str,
    date_to: str,
    police_event_id: str,
    road: str,
    location_text: str,
    event_type: list(vocab.eventTypes),
    district: list(vocab.districts),
    plate: str,
    vehicle_text: str,
    person: str,
    person_role: list(PERSON_ROLES),
    text: str,
    status: list(STATUSES),
    include_cancelled: bool,
    damaged: bool,
    damage_location: list(vocab.hitTypes),
    volunteer_status: list(VOLUNTEER_STATUS_VALUES),
    no_shift_from: str,
    no_shift_to: str,
  }
  return {
    type: 'object',
    properties,
    required: [...SMART_SEARCH_FILTER_KEYS],
    additionalProperties: false,
  }
}
