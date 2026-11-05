/**
 * Advanced filters on the unit אירועים list.
 *
 * A filter is a rule: field + operator + value. Rules combine with AND; a
 * multi-value rule (אחמ״ש, סוג רכב) matches any of its values. With no rules the
 * page runs exactly today's list (fetch cap, 12-hour / 30-day window); with
 * rules it asks the database for matching events across all dates instead.
 */

import { partitionUnitEventsByWindow, type EventListItem } from './events'
import { digitsOnly, formatDate } from './format'
import { keepShiftLeadRecentEvent, shouldApplyShiftLeadRecentWindow } from './shiftLeadEventsWindow'
import type { EventStatus } from './status'
import { unitEventsCreatedByFilter } from './unitEventsScope'

export type FilterField =
  | 'shift_lead'
  | 'responder'
  | 'event_id'
  | 'event_date'
  | 'treated_plate'
  | 'vehicle_kind'

export type FilterRule =
  | { field: 'shift_lead'; op: 'any_of'; value: string[] }
  | { field: 'vehicle_kind'; op: 'any_of'; value: string[] }
  | { field: 'responder'; op: 'contains'; value: string }
  | { field: 'treated_plate'; op: 'contains'; value: string }
  | { field: 'event_id'; op: 'is' | 'contains'; value: string }
  /** `on` reads `from` only; `between` takes either end or both. */
  | { field: 'event_date'; op: 'on' | 'between'; value: { from: string; to: string } }

export type FilterOp = FilterRule['op']

type FieldDef = { field: FilterField; label: string; ops: { op: FilterOp; label: string }[] }

export const FILTER_FIELDS: readonly FieldDef[] = [
  { field: 'shift_lead', label: 'אחמ״ש', ops: [{ op: 'any_of', label: 'אחד מהנבחרים' }] },
  { field: 'responder', label: 'כונן', ops: [{ op: 'contains', label: 'שם או או״ק מכיל' }] },
  {
    field: 'event_id',
    label: 'מספר אירוע',
    ops: [
      { op: 'is', label: 'שווה ל־' },
      { op: 'contains', label: 'מכיל' },
    ],
  },
  {
    field: 'event_date',
    label: 'תאריך האירוע',
    ops: [
      { op: 'on', label: 'בתאריך' },
      { op: 'between', label: 'בטווח תאריכים' },
    ],
  },
  { field: 'treated_plate', label: 'מספר רכב שטופל', ops: [{ op: 'contains', label: 'מכיל' }] },
  { field: 'vehicle_kind', label: 'סוג רכב שטופל', ops: [{ op: 'any_of', label: 'אחד מהנבחרים' }] },
]

export function fieldDef(field: FilterField): FieldDef {
  return FILTER_FIELDS.find((def) => def.field === field)!
}

export function emptyRule(field: FilterField): FilterRule {
  switch (field) {
    case 'shift_lead':
    case 'vehicle_kind':
      return { field, op: 'any_of', value: [] }
    case 'responder':
    case 'treated_plate':
      return { field, op: 'contains', value: '' }
    case 'event_id':
      return { field, op: 'is', value: '' }
    case 'event_date':
      return { field, op: 'on', value: { from: '', to: '' } }
  }
}

/** Trims and collapses spaces; drops `*` (PostgREST's wildcard) and the quote/escape characters. */
export function cleanFilterText(value: string): string {
  return value.replace(/[*\\"]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** LIKE treats `%` and `_` as wildcards; a typed one should match itself. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** One `ilike` value inside a PostgREST `or()` list, quoted so commas and parentheses stay literal. */
export function orIlikeContains(column: string, text: string): string {
  const quoted = `*${escapeLike(text)}*`.replace(/[\\"]/g, (char) => `\\${char}`)
  return `${column}.ilike."${quoted}"`
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (value: string) => ISO_DAY.test(value)

/** Hebrew fix for an incomplete rule, or null when it can run. */
export function ruleError(rule: FilterRule): string | null {
  switch (rule.field) {
    case 'shift_lead':
      return rule.value.length > 0 ? null : 'יש לבחור אחמ״ש אחד לפחות.'
    case 'vehicle_kind':
      return rule.value.length > 0 ? null : 'יש לבחור סוג רכב אחד לפחות.'
    case 'responder':
      return cleanFilterText(rule.value).length >= 2 ? null : 'יש להזין לפחות 2 תווים.'
    case 'treated_plate':
      return digitsOnly(rule.value).length >= 2 ? null : 'יש להזין לפחות 2 ספרות.'
    case 'event_id':
      return digitsOnly(rule.value).length > 0 ? null : 'יש להזין מספר אירוע.'
    case 'event_date': {
      const { from, to } = rule.value
      if (rule.op === 'on') return isDay(from) ? null : 'יש להזין תאריך.'
      if (!isDay(from) && !isDay(to)) return 'יש להזין תאריך התחלה, תאריך סיום או את שניהם.'
      if (isDay(from) && isDay(to) && from > to) return 'תאריך הסיום מוקדם מתאריך ההתחלה.'
      return null
    }
  }
}

/** Rules that can run, one per field (the last one wins), values normalized. */
export function activeRules(rules: readonly FilterRule[]): FilterRule[] {
  const byField = new Map<FilterField, FilterRule>()
  for (const rule of rules) {
    if (ruleError(rule)) continue
    byField.set(rule.field, normalizeRule(rule))
  }
  return FILTER_FIELDS.flatMap((def) => {
    const rule = byField.get(def.field)
    return rule ? [rule] : []
  })
}

function normalizeRule(rule: FilterRule): FilterRule {
  switch (rule.field) {
    case 'shift_lead':
    case 'vehicle_kind':
      return { ...rule, value: [...new Set(rule.value)].sort() }
    case 'responder':
      return { ...rule, value: cleanFilterText(rule.value) }
    case 'treated_plate':
    case 'event_id':
      return { ...rule, value: digitsOnly(rule.value) }
    case 'event_date': {
      const from = isDay(rule.value.from) ? rule.value.from : ''
      const to = isDay(rule.value.to) ? rule.value.to : ''
      return rule.op === 'on'
        ? { field: 'event_date', op: 'on', value: { from, to: '' } }
        : { field: 'event_date', op: 'between', value: { from, to } }
    }
  }
}

export type FilterLabels = {
  shiftLeads: ReadonlyMap<string, string>
  vehicleKinds: ReadonlyMap<string, string>
}

function listSummary(ids: readonly string[], names: ReadonlyMap<string, string>): string {
  const labels = ids.map((id) => names.get(id) ?? 'לא ידוע')
  return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : (labels[0] ?? '')
}

/** The value half of a pill: `דני כהן +1`, `רונית`, `מכיל 482`, `01.11.2026 עד 05.11.2026`. */
export function ruleValueLabel(rule: FilterRule, labels: FilterLabels): string {
  switch (rule.field) {
    case 'shift_lead':
      return listSummary(rule.value, labels.shiftLeads)
    case 'vehicle_kind':
      return listSummary(rule.value, labels.vehicleKinds)
    case 'responder':
    case 'treated_plate':
      return rule.value
    case 'event_id':
      return rule.op === 'is' ? rule.value : `מכיל ${rule.value}`
    case 'event_date':
      return dateRuleLabel(rule)
  }
}

/** Field and value in one line, for the pill's accessible name: `אחמ״ש: דני כהן +1`. */
export function ruleSummary(rule: FilterRule, labels: FilterLabels): string {
  return `${fieldDef(rule.field).label}: ${ruleValueLabel(rule, labels)}`
}

export type DateRule = Extract<FilterRule, { field: 'event_date' }>

/** `01.11.2026`, `01.11.2026 עד 05.11.2026`, `מ־01.11.2026`, `עד 05.11.2026`. */
export function dateRuleLabel(rule: DateRule): string {
  const { from, to } = rule.value
  if (rule.op === 'on' || (from && from === to)) return formatDate(from)
  if (from && to) return `${formatDate(from)} עד ${formatDate(to)}`
  return from ? `מ־${formatDate(from)}` : `עד ${formatDate(to)}`
}

/**
 * The always-present תקופה pill. `recent` is the אחמ״ש 12-hour list, `window` the
 * 30-day window (טען עוד adds more), `all` is what any other rule implies (the
 * query spans every date), `on` / `between` an event_date rule.
 */
export type PeriodChoice = 'recent' | 'window' | 'all' | 'on' | 'between'

export const PERIOD_LABELS = {
  recent: '12 שעות אחרונות',
  window: '30 ימים אחרונים',
  all: 'כל התאריכים',
} as const

export function periodState(
  view: EventListView,
  shiftLeadList: boolean,
): { choice: PeriodChoice; summary: string; changed: boolean } {
  const rules = activeRules(view.rules)
  const date = rules.find((rule): rule is DateRule => rule.field === 'event_date')
  if (date) return { choice: date.op, summary: dateRuleLabel(date), changed: true }
  if (rules.length > 0) return { choice: 'all', summary: PERIOD_LABELS.all, changed: false }
  if (shiftLeadList && !view.showOlder) {
    return { choice: 'recent', summary: PERIOD_LABELS.recent, changed: false }
  }
  return { choice: 'window', summary: PERIOD_LABELS.window, changed: shiftLeadList }
}

/** Back to a time window: drops the date rule; `window` for אחמ״ש is ישנים יותר. */
export function withPeriodWindow(
  view: EventListView,
  choice: 'recent' | 'window',
  shiftLeadList: boolean,
): EventListView {
  return {
    ...view,
    showOlder: choice === 'window' && shiftLeadList,
    rules: view.rules.filter((rule) => rule.field !== 'event_date'),
  }
}

export type EventListView = {
  status: EventStatus | 'all'
  showShiftEvents: boolean
  showOlder: boolean
  showOthers: boolean
  rules: FilterRule[]
}

/** The ברירת מחדל view: today's list exactly as a first visit shows it. */
export const DEFAULT_EVENT_LIST_VIEW: EventListView = {
  status: 'all',
  showShiftEvents: false,
  showOlder: false,
  showOthers: false,
  rules: [],
}

export function sameView(a: EventListView, b: EventListView): boolean {
  return (
    a.status === b.status &&
    a.showShiftEvents === b.showShiftEvents &&
    a.showOlder === b.showOlder &&
    a.showOthers === b.showOthers &&
    JSON.stringify(activeRules(a.rules)) === JSON.stringify(activeRules(b.rules))
  )
}

const STATUSES: readonly (EventStatus | 'all')[] = ['all', 'draft', 'in_progress', 'partial', 'done']

function parseRule(raw: unknown): FilterRule | null {
  if (!raw || typeof raw !== 'object') return null
  const { field, op, value } = raw as { field?: unknown; op?: unknown; value?: unknown }
  const def = FILTER_FIELDS.find((row) => row.field === field)
  if (!def || !def.ops.some((row) => row.op === op)) return null
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((item) => typeof item === 'string') ? (v as string[]) : null
  switch (def.field) {
    case 'shift_lead':
    case 'vehicle_kind': {
      const ids = strings(value)
      return ids ? ({ field: def.field, op: 'any_of', value: ids } as FilterRule) : null
    }
    case 'event_date': {
      const range = value as { from?: unknown; to?: unknown } | null
      if (!range || typeof range.from !== 'string' || typeof range.to !== 'string') return null
      return { field: 'event_date', op: op as 'on' | 'between', value: { from: range.from, to: range.to } }
    }
    default:
      return typeof value === 'string'
        ? ({ field: def.field, op, value } as FilterRule)
        : null
  }
}

/** Bump when the stored shape changes; parseView reads this version and older. */
export const VIEW_VERSION = 1

export function serializeView(view: EventListView): EventListView & { v: number } {
  return { v: VIEW_VERSION, ...view, rules: activeRules(view.rules) }
}

/**
 * Reads a stored view (preset row or session copy). Drops what it cannot trust.
 * No `v` is a version-1 row saved before versions existed; a newer version is
 * skipped rather than half-read.
 */
export function parseView(raw: unknown): EventListView | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.v !== undefined && (typeof row.v !== 'number' || row.v > VIEW_VERSION)) return null
  const status = STATUSES.includes(row.status as EventStatus | 'all')
    ? (row.status as EventStatus | 'all')
    : 'all'
  const rules = Array.isArray(row.rules)
    ? row.rules.map(parseRule).filter((rule): rule is FilterRule => rule !== null)
    : []
  return {
    status,
    showShiftEvents: row.showShiftEvents === true,
    showOlder: row.showOlder === true,
    showOthers: row.showOthers === true,
    rules: activeRules(rules),
  }
}

/**
 * What the unit list loads for a viewer and a view. With the default view this
 * is today's logic: אחמ״ש only (not admin) sees own-created events unless
 * אחרים is on; anyone with אחמ״ש gets the 12-hour list unless ישנים יותר is on.
 * An אחמ״ש rule replaces the own-created scope, since it names whose events to show.
 */
export function unitListPlan(input: {
  roles: readonly string[]
  userId: string | undefined
  view: EventListView
}): { createdById: string | null; recentWindow: boolean; rulesMode: boolean } {
  const rules = activeRules(input.view.rules)
  const rulesMode = rules.length > 0
  const createdById = rules.some((rule) => rule.field === 'shift_lead')
    ? null
    : unitEventsCreatedByFilter({
        roles: input.roles,
        showOthersCreated: input.view.showOthers,
        userId: input.userId,
      })
  return {
    createdById,
    recentWindow: !rulesMode && shouldApplyShiftLeadRecentWindow(input.roles) && !input.view.showOlder,
    rulesMode,
  }
}

/**
 * Which loaded rows the unit list shows. Search and rules already queried the
 * whole database, so they skip the window; otherwise the 12-hour list (אחמ״ש)
 * or the 30-day window with טען עוד, as before.
 */
export function unitListWindow(
  source: EventListItem[],
  opts: {
    searching: boolean
    rulesMode: boolean
    recentWindow: boolean
    viewerId: string | undefined
    now: Date
    today: string
    windowsLoaded: number
  },
): { inWindow: EventListItem[]; hasMore: boolean } {
  if (opts.searching || opts.rulesMode) return { inWindow: source, hasMore: false }
  if (opts.recentWindow) {
    return {
      inWindow: source.filter((event) => keepShiftLeadRecentEvent(event, opts.viewerId, opts.now)),
      hasMore: false,
    }
  }
  const partitioned = partitionUnitEventsByWindow(source, {
    dateOf: (event) => event.event_date,
    today: opts.today,
    windowsLoaded: opts.windowsLoaded,
  })
  return { inWindow: partitioned.visible, hasMore: partitioned.hasMore }
}

export type QueryFilter =
  | { op: 'eq' | 'neq' | 'ilike' | 'gte' | 'lte'; column: string; value: string }
  | { op: 'in'; column: string; value: string[] }
  | { op: 'or'; filters: string; referencedTable: string }

export type RuleQueryPlan = { select: string; filters: QueryFilter[] }

const PLATE_BY_EVENT = 'pe:event_treated_plates!event_treated_plates_event_id_fkey!inner(plate_digits)'
const KIND_BY_EVENT = 'ke:event_treated_vehicles!event_treated_vehicles_event_id_fkey!inner(vehicle_kind_id)'
const PLATE_BY_RESPONDER =
  'pr:event_responders!inner(tp:event_treated_plates!event_treated_plates_event_responder_id_fkey!inner(plate_digits))'
const KIND_BY_RESPONDER = 'kr:event_responders!inner(tv:event_treated_vehicles!inner(vehicle_kind_id))'

/**
 * PostgREST id queries for a set of rules. Treated plates and vehicle kinds sit
 * on the event for shift-born events and on each responder row otherwise, so a
 * rule on them runs as two queries (one per home) and the page merges the ids.
 */
export function ruleQueryPlans(
  rules: readonly FilterRule[],
  base: { shiftLeadId: string | null; status: EventStatus | 'all'; hideShiftEvents: boolean },
): RuleQueryPlan[] {
  const active = activeRules(rules)
  const embeds: string[] = []
  const filters: QueryFilter[] = []
  if (base.shiftLeadId) filters.push({ op: 'eq', column: 'shift_lead_id', value: base.shiftLeadId })
  if (base.status !== 'all') filters.push({ op: 'eq', column: 'status', value: base.status })
  if (base.hideShiftEvents) filters.push({ op: 'neq', column: 'origin', value: 'shift' })

  let plate: string | null = null
  let kinds: string[] | null = null
  for (const rule of active) {
    switch (rule.field) {
      case 'shift_lead':
        filters.push({ op: 'in', column: 'shift_lead_id', value: rule.value })
        break
      case 'responder':
        embeds.push('rf:event_responders!inner(rp:profiles!inner(full_name,callsign))')
        filters.push({
          op: 'or',
          filters: `${orIlikeContains('full_name', rule.value)},${orIlikeContains('callsign', rule.value)}`,
          referencedTable: 'rf.rp',
        })
        break
      case 'event_id':
        filters.push(
          rule.op === 'is'
            ? { op: 'eq', column: 'police_event_id', value: rule.value }
            : { op: 'ilike', column: 'police_event_id', value: `%${rule.value}%` },
        )
        break
      case 'event_date':
        if (rule.op === 'on') {
          filters.push({ op: 'eq', column: 'event_date', value: rule.value.from })
        } else {
          if (rule.value.from) filters.push({ op: 'gte', column: 'event_date', value: rule.value.from })
          if (rule.value.to) filters.push({ op: 'lte', column: 'event_date', value: rule.value.to })
        }
        break
      case 'treated_plate':
        plate = rule.value
        break
      case 'vehicle_kind':
        kinds = rule.value
        break
    }
  }

  const head = ['id', 'event_date', 'created_at', ...embeds]
  if (plate === null && kinds === null) return [{ select: head.join(','), filters }]

  const byEvent: RuleQueryPlan = { select: '', filters: [...filters] }
  const byResponder: RuleQueryPlan = { select: '', filters: [...filters] }
  const eventEmbeds: string[] = []
  const responderEmbeds: string[] = []
  if (plate !== null) {
    eventEmbeds.push(PLATE_BY_EVENT)
    responderEmbeds.push(PLATE_BY_RESPONDER)
    byEvent.filters.push({ op: 'ilike', column: 'pe.plate_digits', value: `%${plate}%` })
    byResponder.filters.push({ op: 'ilike', column: 'pr.tp.plate_digits', value: `%${plate}%` })
  }
  if (kinds !== null) {
    eventEmbeds.push(KIND_BY_EVENT)
    responderEmbeds.push(KIND_BY_RESPONDER)
    byEvent.filters.push({ op: 'in', column: 'ke.vehicle_kind_id', value: kinds })
    byResponder.filters.push({ op: 'in', column: 'kr.tv.vehicle_kind_id', value: kinds })
  }
  byEvent.select = [...head, ...eventEmbeds].join(',')
  byResponder.select = [...head, ...responderEmbeds].join(',')
  return [byEvent, byResponder]
}

export type RuleHit = { id: string; event_date: string; created_at: string | null }

/** Union of the plans' hits, newest first (event_date, then created_at), capped. */
export function mergeRuleHits(
  lists: readonly RuleHit[][],
  limit: number,
): { ids: string[]; capped: boolean } {
  const byId = new Map<string, RuleHit>()
  for (const list of lists) for (const hit of list) byId.set(hit.id, hit)
  const sorted = [...byId.values()].sort((a, b) => {
    if (a.event_date !== b.event_date) return a.event_date < b.event_date ? 1 : -1
    const left = a.created_at ?? ''
    const right = b.created_at ?? ''
    return left < right ? 1 : left > right ? -1 : 0
  })
  const anyListFull = lists.some((list) => list.length >= limit)
  return {
    ids: sorted.slice(0, limit).map((hit) => hit.id),
    capped: sorted.length > limit || anyListFull,
  }
}

const RULES_STORAGE_KEY = 'yahpaz:unitEventsFilterRules'

function sessionStore(storage?: Storage | null): Storage | null {
  return storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
}

/** Rules survive opening an event and coming back, like the toolbar chips. */
export function readSessionRules(storage?: Storage | null): FilterRule[] {
  try {
    const raw = sessionStore(storage)?.getItem(RULES_STORAGE_KEY)
    if (!raw) return []
    return parseView({ rules: JSON.parse(raw) })?.rules ?? []
  } catch {
    return []
  }
}

export function writeSessionRules(rules: readonly FilterRule[], storage?: Storage | null): void {
  try {
    const store = sessionStore(storage)
    if (!store) return
    const active = activeRules(rules)
    if (active.length === 0) store.removeItem(RULES_STORAGE_KEY)
    else store.setItem(RULES_STORAGE_KEY, JSON.stringify(active))
  } catch {
    // sessionStorage can throw in private mode
  }
}
