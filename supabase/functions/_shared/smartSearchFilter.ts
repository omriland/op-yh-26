export type SmartSearchIntent = 'find' | 'export' | 'unsupported_question'
export type SmartSearchEntity = 'events' | 'people' | 'both'
export type SmartSearchSource = 'new' | 'archive' | 'both'
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
}
export type SmartSearchVocab = { eventTypes: string[]; districts: string[]; hitTypes: string[] }

export const SMART_SEARCH_FILTER_KEYS: readonly (keyof SmartSearchFilter)[] = [
  'intent', 'entity', 'source', 'date_from', 'date_to', 'police_event_id', 'road',
  'location_text', 'event_type', 'district', 'plate', 'vehicle_text', 'person',
  'person_role', 'text', 'status', 'include_cancelled', 'damaged', 'damage_location',
]
export const SMART_SEARCH_MAX_QUERY_CHARS = 300

const INTENTS = ['find', 'export', 'unsupported_question']
const ENTITIES = ['events', 'people', 'both']
const SOURCES = ['new', 'archive', 'both']
const PERSON_ROLES = ['responder', 'lead', 'any']
const STATUSES = ['draft', 'in_progress', 'partial', 'done']
const MAX_STRING_CHARS = 100

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

export function validateSmartSearchFilter(raw: unknown, vocab: SmartSearchVocab): SmartSearchFilter {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const f: SmartSearchFilter = {
    intent: (oneOf(r.intent, INTENTS) ?? 'find') as SmartSearchIntent,
    entity: (oneOf(r.entity, ENTITIES) ?? 'both') as SmartSearchEntity,
    source: (oneOf(r.source, SOURCES) ?? 'both') as SmartSearchSource,
  }

  let from = cleanDate(r.date_from)
  let to = cleanDate(r.date_to)
  if (from && to && from > to) [from, to] = [to, from]
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

  if (typeof r.include_cancelled === 'boolean') f.include_cancelled = r.include_cancelled
  if (typeof r.damaged === 'boolean') f.damaged = r.damaged

  return f
}

export function smartSearchJsonSchema(vocab: SmartSearchVocab): Record<string, unknown> {
  const str = { type: ['string', 'null'] }
  const nullableEnum = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] })
  const properties: Record<keyof SmartSearchFilter, unknown> = {
    intent: { type: 'string', enum: INTENTS },
    entity: { type: 'string', enum: ENTITIES },
    source: { type: 'string', enum: SOURCES },
    date_from: str,
    date_to: str,
    police_event_id: str,
    road: str,
    location_text: str,
    event_type: nullableEnum(vocab.eventTypes),
    district: nullableEnum(vocab.districts),
    plate: str,
    vehicle_text: str,
    person: str,
    person_role: nullableEnum(PERSON_ROLES),
    text: str,
    status: nullableEnum(STATUSES),
    include_cancelled: { type: ['boolean', 'null'] },
    damaged: { type: ['boolean', 'null'] },
    damage_location: nullableEnum(vocab.hitTypes),
  }
  return {
    name: 'smart_search_filter',
    strict: true,
    schema: {
      type: 'object',
      properties,
      required: [...SMART_SEARCH_FILTER_KEYS],
      additionalProperties: false,
    },
  }
}
