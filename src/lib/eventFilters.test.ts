import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENT_LIST_VIEW,
  activeRules,
  PERIOD_LABELS,
  VIEW_VERSION,
  cleanFilterText,
  emptyRule,
  escapeLike,
  orIlikeContains,
  periodState,
  ruleValueLabel,
  serializeView,
  withPeriodWindow,
  mergeRuleHits,
  parseView,
  readSessionRules,
  ruleError,
  ruleQueryPlans,
  ruleSummary,
  sameView,
  unitListPlan,
  unitListWindow,
  writeSessionRules,
  type EventListView,
  type FilterRule,
} from './eventFilters'
import type { EventListItem, EventResponderSummary } from './events'
import { partitionUnitEventsByWindow } from './events'
import { keepShiftLeadRecentEvent, shouldApplyShiftLeadRecentWindow } from './shiftLeadEventsWindow'
import { unitEventsCreatedByFilter } from './unitEventsScope'

const NOW = new Date('2026-11-04T12:00:00.000Z')
const TODAY = '2026-11-04'

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()
}

function responder(partial: Partial<EventResponderSummary> = {}): EventResponderSummary {
  return {
    id: 'r1',
    responder_id: 'u1',
    status: 'done',
    total_km: 12,
    started_at: '2026-11-04T06:00:00+03:00',
    ended_at: '2026-11-04T07:00:00+03:00',
    profile: { full_name: 'כונן', callsign: 'A1' },
    ...partial,
  }
}

function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    shift_lead_id: 'lead',
    created_at: hoursAgo(1),
    event_date: TODAY,
    police_event_id: '12345',
    patrol_callsign: 'ניידת 1',
    location: 'מחלף אייל',
    status: 'done',
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: { name: 'שלוחה צפון' },
    event_type: { name: 'פינוי רכב' },
    road: { name: 'כביש 6' },
    shift_lead: null,
    last_saved: null,
    shift: null,
    shared_treated: [],
    responders: [responder()],
    ...partial,
  }
}

const ROLE_SETS: string[][] = [
  ['shift_lead'],
  ['shift_lead', 'responder'],
  ['admin'],
  ['admin', 'shift_lead'],
  ['super_admin'],
  ['super_admin', 'shift_lead'],
  ['responder'],
  [],
]

function view(partial: Partial<EventListView> = {}): EventListView {
  return { ...DEFAULT_EVENT_LIST_VIEW, ...partial }
}

describe('default preset reproduces today’s אירועים list', () => {
  it('is status הכול, every chip off, no rules', () => {
    expect(DEFAULT_EVENT_LIST_VIEW).toEqual({
      status: 'all',
      showShiftEvents: false,
      showOlder: false,
      showOthers: false,
      rules: [],
    })
  })

  it.each(ROLE_SETS)('loads exactly what today loads for roles %j', (...roles) => {
    for (const showOthers of [false, true]) {
      for (const showOlder of [false, true]) {
        const plan = unitListPlan({ roles, userId: 'me', view: view({ showOthers, showOlder }) })
        expect(plan.rulesMode).toBe(false)
        expect(plan.createdById).toBe(
          unitEventsCreatedByFilter({ roles, showOthersCreated: showOthers, userId: 'me' }),
        )
        expect(plan.recentWindow).toBe(shouldApplyShiftLeadRecentWindow(roles) && !showOlder)
      }
    }
  })

  it('pure אחמ״ש: own-created events, last 12 hours plus his older incomplete ones', () => {
    const plan = unitListPlan({ roles: ['shift_lead'], userId: 'lead', view: DEFAULT_EVENT_LIST_VIEW })
    expect(plan).toEqual({ createdById: 'lead', recentWindow: true, rulesMode: false })
    const rows = [
      event({ id: 'fresh', created_at: hoursAgo(1) }),
      event({ id: 'old-complete', created_at: hoursAgo(13) }),
      event({ id: 'old-mine-missing', created_at: hoursAgo(30), police_event_id: null }),
      event({ id: 'old-other-missing', created_at: hoursAgo(30), police_event_id: null, shift_lead_id: 'x' }),
    ]
    const result = unitListWindow(rows, {
      searching: false,
      rulesMode: plan.rulesMode,
      recentWindow: plan.recentWindow,
      viewerId: 'lead',
      now: NOW,
      today: TODAY,
      windowsLoaded: 1,
    })
    expect(result.inWindow.map((row) => row.id)).toEqual(['fresh', 'old-mine-missing'])
    expect(result.hasMore).toBe(false)
    expect(result.inWindow).toEqual(rows.filter((row) => keepShiftLeadRecentEvent(row, 'lead', NOW)))
  })

  it('admin: every lead’s events, 30-day window with טען עוד', () => {
    const plan = unitListPlan({ roles: ['admin'], userId: 'boss', view: DEFAULT_EVENT_LIST_VIEW })
    expect(plan).toEqual({ createdById: null, recentWindow: false, rulesMode: false })
    const rows = [
      event({ id: 'today', event_date: TODAY }),
      event({ id: 'day-29', event_date: '2026-10-06' }),
      event({ id: 'day-31', event_date: '2026-10-04' }),
    ]
    const opts = {
      searching: false,
      rulesMode: false,
      recentWindow: false,
      viewerId: 'boss',
      now: NOW,
      today: TODAY,
    }
    const first = unitListWindow(rows, { ...opts, windowsLoaded: 1 })
    expect(first.inWindow.map((row) => row.id)).toEqual(['today', 'day-29'])
    expect(first.hasMore).toBe(true)
    expect(first.inWindow).toEqual(
      partitionUnitEventsByWindow(rows, { dateOf: (row) => row.event_date, today: TODAY, windowsLoaded: 1 })
        .visible,
    )
    expect(unitListWindow(rows, { ...opts, windowsLoaded: 2 }).hasMore).toBe(false)
  })

  it('admin who is also אחמ״ש: whole unit, but the 12-hour list', () => {
    expect(
      unitListPlan({ roles: ['admin', 'shift_lead'], userId: 'me', view: DEFAULT_EVENT_LIST_VIEW }),
    ).toEqual({ createdById: null, recentWindow: true, rulesMode: false })
  })

  it('search still skips the window, as today', () => {
    const rows = [event({ id: 'old', created_at: hoursAgo(100), event_date: '2026-01-01' })]
    const result = unitListWindow(rows, {
      searching: true,
      rulesMode: false,
      recentWindow: true,
      viewerId: 'lead',
      now: NOW,
      today: TODAY,
      windowsLoaded: 1,
    })
    expect(result.inWindow.map((row) => row.id)).toEqual(['old'])
  })
})

describe('rules mode', () => {
  const byLead: FilterRule = { field: 'shift_lead', op: 'any_of', value: ['dan'] }

  it('switches the list to the database query and drops the time window', () => {
    const plan = unitListPlan({
      roles: ['shift_lead'],
      userId: 'lead',
      view: view({ rules: [{ field: 'event_id', op: 'is', value: '48210' }] }),
    })
    expect(plan).toEqual({ createdById: 'lead', recentWindow: false, rulesMode: true })
    const rows = [event({ id: 'old', created_at: hoursAgo(100), event_date: '2026-01-01' })]
    const result = unitListWindow(rows, {
      searching: false,
      rulesMode: true,
      recentWindow: false,
      viewerId: 'lead',
      now: NOW,
      today: TODAY,
      windowsLoaded: 1,
    })
    expect(result).toEqual({ inWindow: rows, hasMore: false })
  })

  it('an אחמ״ש rule replaces the own-created scope', () => {
    expect(unitListPlan({ roles: ['shift_lead'], userId: 'lead', view: view({ rules: [byLead] }) }).createdById).toBe(
      null,
    )
  })

  it('incomplete rules do not count', () => {
    const plan = unitListPlan({
      roles: ['admin'],
      userId: 'me',
      view: view({ rules: [emptyRule('responder'), emptyRule('shift_lead')] }),
    })
    expect(plan.rulesMode).toBe(false)
  })
})

describe('rule validation', () => {
  it('names the fix for each incomplete rule', () => {
    expect(ruleError(emptyRule('shift_lead'))).toBe('יש לבחור אחמ״ש אחד לפחות.')
    expect(ruleError(emptyRule('vehicle_kind'))).toBe('יש לבחור סוג רכב אחד לפחות.')
    expect(ruleError({ field: 'responder', op: 'contains', value: 'ר' })).toBe('יש להזין לפחות 2 תווים.')
    expect(ruleError({ field: 'treated_plate', op: 'contains', value: '1' })).toBe('יש להזין לפחות 2 ספרות.')
    expect(ruleError(emptyRule('event_id'))).toBe('יש להזין מספר אירוע.')
    expect(ruleError(emptyRule('event_date'))).toBe('יש להזין תאריך.')
  })

  it('accepts one date, an open-ended range, or a full range in order', () => {
    const on = { field: 'event_date', op: 'on', value: { from: '2026-11-01', to: '' } } as const
    expect(ruleError(on)).toBeNull()
    const between = (from: string, to: string): FilterRule => ({
      field: 'event_date',
      op: 'between',
      value: { from, to },
    })
    expect(ruleError(between('2026-11-01', ''))).toBeNull()
    expect(ruleError(between('', '2026-11-05'))).toBeNull()
    expect(ruleError(between('2026-11-01', '2026-11-05'))).toBeNull()
    expect(ruleError(between('', ''))).toBe('יש להזין תאריך התחלה, תאריך סיום או את שניהם.')
    expect(ruleError(between('2026-11-05', '2026-11-01'))).toBe('תאריך הסיום מוקדם מתאריך ההתחלה.')
  })

  it('keeps one normalized rule per field, in field order', () => {
    const rules = activeRules([
      { field: 'treated_plate', op: 'contains', value: '12-345' },
      { field: 'responder', op: 'contains', value: '  רונית*  "318" ' },
      { field: 'shift_lead', op: 'any_of', value: ['b', 'a', 'b'] },
      { field: 'responder', op: 'contains', value: 'x' },
    ])
    expect(rules).toEqual([
      { field: 'shift_lead', op: 'any_of', value: ['a', 'b'] },
      { field: 'responder', op: 'contains', value: 'רונית 318' },
      { field: 'treated_plate', op: 'contains', value: '12345' },
    ])
  })

  it('drops only PostgREST’s wildcard and the quote/escape characters', () => {
    expect(cleanFilterText('a*b\\c"d')).toBe('a b c d')
    expect(cleanFilterText('רון_לוי, (318) 50%')).toBe('רון_לוי, (318) 50%')
  })

  it('escapes LIKE wildcards so a typed % or _ matches itself', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x')
    expect(orIlikeContains('full_name', 'רון_לוי, (318)')).toBe(
      'full_name.ilike."*רון\\\\_לוי, (318)*"',
    )
    expect(orIlikeContains('callsign', 'a"b')).toBe('callsign.ilike."*a\\"b*"')
  })
})

describe('rule chips', () => {
  const labels = {
    shiftLeads: new Map([
      ['dan', 'דני כהן · 214'],
      ['ron', 'רונית לוי · 318'],
    ]),
    vehicleKinds: new Map([['truck', 'משאית']]),
  }

  it('reads as one Hebrew line per rule', () => {
    expect(ruleSummary({ field: 'shift_lead', op: 'any_of', value: ['dan'] }, labels)).toBe('אחמ״ש: דני כהן · 214')
    expect(ruleSummary({ field: 'shift_lead', op: 'any_of', value: ['dan', 'ron'] }, labels)).toBe(
      'אחמ״ש: דני כהן · 214 +1',
    )
    expect(ruleSummary({ field: 'vehicle_kind', op: 'any_of', value: ['truck'] }, labels)).toBe('סוג רכב שטופל: משאית')
    expect(ruleSummary({ field: 'responder', op: 'contains', value: 'רונית' }, labels)).toBe('כונן: רונית')
    expect(ruleSummary({ field: 'event_id', op: 'is', value: '48210' }, labels)).toBe('מספר אירוע: 48210')
    expect(ruleSummary({ field: 'event_id', op: 'contains', value: '482' }, labels)).toBe('מספר אירוע: מכיל 482')
    expect(ruleValueLabel({ field: 'treated_plate', op: 'contains', value: '12345' }, labels)).toBe('12345')
    expect(ruleValueLabel({ field: 'shift_lead', op: 'any_of', value: ['gone'] }, labels)).toBe('לא ידוע')
    expect(
      ruleSummary({ field: 'event_date', op: 'on', value: { from: '2026-11-01', to: '' } }, labels),
    ).toBe('תאריך האירוע: 01.11.2026')
    expect(
      ruleSummary({ field: 'event_date', op: 'between', value: { from: '2026-11-01', to: '2026-11-05' } }, labels),
    ).toBe('תאריך האירוע: 01.11.2026 עד 05.11.2026')
    expect(
      ruleSummary({ field: 'event_date', op: 'between', value: { from: '2026-11-01', to: '' } }, labels),
    ).toBe('תאריך האירוע: מ־01.11.2026')
    expect(
      ruleSummary({ field: 'event_date', op: 'between', value: { from: '', to: '2026-11-05' } }, labels),
    ).toBe('תאריך האירוע: עד 05.11.2026')
  })
})

describe('ruleQueryPlans', () => {
  const base = { shiftLeadId: null, status: 'all' as const, hideShiftEvents: false }

  it('combines event-level rules with AND in a single id query', () => {
    const plans = ruleQueryPlans(
      [
        { field: 'shift_lead', op: 'any_of', value: ['dan', 'ron'] },
        { field: 'event_id', op: 'contains', value: '482' },
        { field: 'event_date', op: 'between', value: { from: '2026-11-01', to: '2026-11-05' } },
      ],
      { shiftLeadId: 'lead', status: 'partial', hideShiftEvents: true },
    )
    expect(plans).toEqual([
      {
        select: 'id,event_date,created_at',
        filters: [
          { op: 'eq', column: 'shift_lead_id', value: 'lead' },
          { op: 'eq', column: 'status', value: 'partial' },
          { op: 'neq', column: 'origin', value: 'shift' },
          { op: 'in', column: 'shift_lead_id', value: ['dan', 'ron'] },
          { op: 'ilike', column: 'police_event_id', value: '%482%' },
          { op: 'gte', column: 'event_date', value: '2026-11-01' },
          { op: 'lte', column: 'event_date', value: '2026-11-05' },
        ],
      },
    ])
  })

  it('a single date is an exact match on event_date', () => {
    const [plan] = ruleQueryPlans([{ field: 'event_date', op: 'on', value: { from: '2026-11-01', to: '' } }], base)
    expect(plan!.filters).toEqual([{ op: 'eq', column: 'event_date', value: '2026-11-01' }])
  })

  it('matches a responder by name or callsign through an inner join', () => {
    const [plan] = ruleQueryPlans([{ field: 'responder', op: 'contains', value: 'רונית' }], base)
    expect(plan!.select).toBe(
      'id,event_date,created_at,rf:event_responders!inner(rp:profiles!inner(full_name,callsign))',
    )
    expect(plan!.filters).toEqual([
      {
        op: 'or',
        filters: 'full_name.ilike."*רונית*",callsign.ilike."*רונית*"',
        referencedTable: 'rf.rp',
      },
    ])
  })

  it('runs treated-vehicle rules once per home: the event (shift-born) and each responder', () => {
    const plans = ruleQueryPlans(
      [
        { field: 'treated_plate', op: 'contains', value: '12-345' },
        { field: 'vehicle_kind', op: 'any_of', value: ['truck'] },
        { field: 'event_id', op: 'is', value: '48210' },
      ],
      base,
    )
    expect(plans).toHaveLength(2)
    const [byEvent, byResponder] = plans
    expect(byEvent!.select).toContain('pe:event_treated_plates!event_treated_plates_event_id_fkey!inner(plate_digits)')
    expect(byEvent!.select).toContain(
      'ke:event_treated_vehicles!event_treated_vehicles_event_id_fkey!inner(vehicle_kind_id)',
    )
    expect(byEvent!.filters).toEqual([
      { op: 'eq', column: 'police_event_id', value: '48210' },
      { op: 'ilike', column: 'pe.plate_digits', value: '%12345%' },
      { op: 'in', column: 'ke.vehicle_kind_id', value: ['truck'] },
    ])
    expect(byResponder!.select).toContain('pr:event_responders!inner(tp:event_treated_plates')
    expect(byResponder!.select).toContain('kr:event_responders!inner(tv:event_treated_vehicles!inner(vehicle_kind_id))')
    expect(byResponder!.filters).toEqual([
      { op: 'eq', column: 'police_event_id', value: '48210' },
      { op: 'ilike', column: 'pr.tp.plate_digits', value: '%12345%' },
      { op: 'in', column: 'kr.tv.vehicle_kind_id', value: ['truck'] },
    ])
  })

  it('ignores incomplete rules', () => {
    expect(ruleQueryPlans([emptyRule('treated_plate'), emptyRule('responder')], base)).toEqual([
      { select: 'id,event_date,created_at', filters: [] },
    ])
  })
})

describe('mergeRuleHits', () => {
  it('unions plans newest first and reports the cap', () => {
    const merged = mergeRuleHits(
      [
        [
          { id: 'a', event_date: '2026-11-01', created_at: '2026-11-01T08:00:00Z' },
          { id: 'b', event_date: '2026-10-01', created_at: null },
        ],
        [
          { id: 'c', event_date: '2026-11-01', created_at: '2026-11-01T09:00:00Z' },
          { id: 'a', event_date: '2026-11-01', created_at: '2026-11-01T08:00:00Z' },
        ],
      ],
      2,
    )
    expect(merged).toEqual({ ids: ['c', 'a'], capped: true })
    expect(mergeRuleHits([[{ id: 'a', event_date: '2026-11-01', created_at: null }]], 5)).toEqual({
      ids: ['a'],
      capped: false,
    })
  })
})

describe('stored views', () => {
  it('round-trips and compares a view with rules', () => {
    const saved: EventListView = view({
      status: 'done',
      showShiftEvents: true,
      rules: [
        { field: 'vehicle_kind', op: 'any_of', value: ['truck'] },
        { field: 'event_date', op: 'between', value: { from: '2026-11-01', to: '2026-11-05' } },
      ],
    })
    const parsed = parseView(JSON.parse(JSON.stringify(saved)))
    expect(parsed).not.toBeNull()
    expect(sameView(parsed!, saved)).toBe(true)
    expect(sameView(parsed!, DEFAULT_EVENT_LIST_VIEW)).toBe(false)
  })

  it('drops unknown fields, bad operators and wrong value shapes', () => {
    expect(
      parseView({
        status: 'nope',
        showOlder: 'yes',
        rules: [
          { field: 'police_station', op: 'is', value: 'x' },
          { field: 'event_id', op: 'gt', value: '1' },
          { field: 'shift_lead', op: 'any_of', value: 'dan' },
          { field: 'event_id', op: 'is', value: '48210' },
        ],
      }),
    ).toEqual({ ...DEFAULT_EVENT_LIST_VIEW, rules: [{ field: 'event_id', op: 'is', value: '48210' }] })
    expect(parseView(null)).toBeNull()
  })

  it('keeps rules in sessionStorage like the toolbar chips', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage
    expect(readSessionRules(storage)).toEqual([])
    writeSessionRules([{ field: 'event_id', op: 'is', value: '48210' }], storage)
    expect(readSessionRules(storage)).toEqual([{ field: 'event_id', op: 'is', value: '48210' }])
    writeSessionRules([], storage)
    expect(store.size).toBe(0)
  })
})

describe('versioned views', () => {
  it('writes the current version and reads it back', () => {
    const stored = serializeView(view({ status: 'done' }))
    expect(stored.v).toBe(VIEW_VERSION)
    expect(parseView(JSON.parse(JSON.stringify(stored)))).toEqual(view({ status: 'done' }))
  })

  it('reads a row saved before versions existed as version 1', () => {
    expect(parseView({ status: 'partial', rules: [] })).toEqual(view({ status: 'partial' }))
  })

  it('skips a newer or malformed version instead of half reading it', () => {
    expect(parseView({ v: VIEW_VERSION + 1, status: 'done' })).toBeNull()
    expect(parseView({ v: 'one', status: 'done' })).toBeNull()
  })
})

describe('תקופה pill', () => {
  const dateRule = (from: string, to = ''): FilterRule => ({
    field: 'event_date',
    op: to ? 'between' : 'on',
    value: { from, to },
  })

  it('names today’s default honestly per role', () => {
    expect(periodState(DEFAULT_EVENT_LIST_VIEW, true)).toEqual({
      choice: 'recent',
      summary: PERIOD_LABELS.recent,
      changed: false,
    })
    expect(periodState(DEFAULT_EVENT_LIST_VIEW, false)).toEqual({
      choice: 'window',
      summary: PERIOD_LABELS.window,
      changed: false,
    })
  })

  it('30 days for אחמ״ש is the ישנים יותר chip, and counts as a change', () => {
    const older = withPeriodWindow(DEFAULT_EVENT_LIST_VIEW, 'window', true)
    expect(older.showOlder).toBe(true)
    expect(periodState(older, true)).toEqual({ choice: 'window', summary: PERIOD_LABELS.window, changed: true })
    expect(withPeriodWindow(DEFAULT_EVENT_LIST_VIEW, 'window', false).showOlder).toBe(false)
    expect(sameView(withPeriodWindow(older, 'recent', true), DEFAULT_EVENT_LIST_VIEW)).toBe(true)
  })

  it('a day or a range shows the dates; other rules mean every date', () => {
    expect(periodState(view({ rules: [dateRule('2026-11-01')] }), true).summary).toBe('01.11.2026')
    expect(periodState(view({ rules: [dateRule('2026-11-01', '2026-11-05')] }), true)).toEqual({
      choice: 'between',
      summary: '01.11.2026 עד 05.11.2026',
      changed: true,
    })
    expect(periodState(view({ rules: [{ field: 'event_id', op: 'is', value: '1' }] }), true)).toEqual({
      choice: 'all',
      summary: PERIOD_LABELS.all,
      changed: false,
    })
  })

  it('going back to a window drops the date rule and keeps the others', () => {
    const next = withPeriodWindow(
      view({ rules: [dateRule('2026-11-01'), { field: 'event_id', op: 'is', value: '1' }] }),
      'recent',
      true,
    )
    expect(next.rules).toEqual([{ field: 'event_id', op: 'is', value: '1' }])
  })
})
