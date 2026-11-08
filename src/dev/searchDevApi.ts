// DEV-ONLY: a stubbed search data boundary with invented sample data, scoped per
// role the way RLS scopes the real thing (a כונן sees only released events they are
// on, no archive, no phone). Used by search-dev.html and app-shell-dev.html.

import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import type { EventListItem } from '../lib/events'
import { eventLifecycle } from '../lib/eventLifecycle'
import type { SearchApi } from '../lib/search/prepareQuery'
import { parseRules } from '../lib/search/searchRules'
import { filterForRole, type SearchRole } from '../lib/search/searchRole'
import type { ArchiveRow, Interpretation, PersonHit, SearchEvent } from '../lib/smartSearchApi'
import { directFilter, isBlankQuery, isDirectQuery } from '../lib/smartSearch'

export const DEV_TODAY = '2026-11-08'
export const DEV_VIEWER_ID = 'dev-user'
const VOCAB = { eventTypes: ['תאונה', 'תקוע', 'חילוץ', 'גרירה'], districts: ['צפון', 'מרכז', 'דרום'] }

export const DEV_SENTENCES = {
  person: 'האירועים של יוסי בצפון בחודש שעבר',
  shifts: 'מתנדבים פעילים בלי משמרת השבוע',
  none: 'סוזוקי ירוקה בכביש 90 אתמול',
  fail: 'רכב תקוע על הגשר ליד הצומת',
}

type DevPerson = PersonHit & { phone: string; email: string; shifts: string[] }

const PEOPLE: DevPerson[] = [
  { id: 'p-levi', full_name: 'יוסי לוי (דוגמה)', callsign: '411', volunteer_status: 'active_volunteer', highest_role: 'responder', last_active_at: '2026-11-08T09:10:00Z', phone: '050-0000411', email: 'levi@example.com', shifts: ['2026-11-04'] },
  { id: 'p-barak', full_name: 'יוסי ברק (דוגמה)', callsign: '412', volunteer_status: 'active_volunteer', highest_role: 'responder', last_active_at: null, phone: '050-0000412', email: 'barak@example.com', shifts: ['2026-11-09'] },
  { id: 'p-dana', full_name: 'דנה כהן (דוגמה)', callsign: '402', volunteer_status: 'active_volunteer', highest_role: 'responder', last_active_at: null, phone: '050-0000402', email: 'dana@example.com', shifts: [] },
  { id: 'p-ronit', full_name: 'רונית אבירם (דוגמה)', callsign: '800', volunteer_status: 'active_volunteer', highest_role: 'shift_lead', last_active_at: '2026-11-08T07:00:00Z', phone: '050-0000800', email: 'ronit@example.com', shifts: ['2026-11-08'] },
  { id: 'p-avi', full_name: 'אבי שמש (דוגמה)', callsign: '415', volunteer_status: 'phone_training', highest_role: 'responder', last_active_at: null, phone: '050-0000415', email: 'avi@example.com', shifts: ['2026-11-02'] },
  { id: DEV_VIEWER_ID, full_name: 'משתמש לדוגמה', callsign: '214', volunteer_status: 'active_volunteer', highest_role: 'responder', last_active_at: null, phone: '050-0000214', email: 'me@example.com', shifts: [] },
]

type DevEvent = EventListItem & { who: string[]; district_name: string }

function devEvent(
  id: string,
  date: string,
  police: string | null,
  road: string,
  location: string,
  type: string | null,
  district: string,
  who: string[],
  doneBy: string[],
): DevEvent {
  return {
    id,
    shift_lead_id: 'p-ronit',
    event_date: date,
    police_event_id: police,
    patrol_callsign: null,
    patrol_callsign_prefix: 'אביב',
    patrol_callsign_number: police ? '411' : '',
    started_at: `${date}T08:00:00Z`,
    ended_at: `${date}T09:00:00Z`,
    location,
    status: doneBy.length === who.length ? 'done' : doneBy.length > 0 ? 'partial' : 'in_progress',
    lead_km_owed: false,
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: { name: district },
    district_name: district,
    event_type: type ? { name: type } : null,
    road: { name: road },
    shift_lead: { full_name: 'רונית אבירם (דוגמה)', callsign: '800' },
    last_saved: null,
    shift: null,
    shared_treated: [],
    who,
    responders: who.map((pid) => {
      const p = PEOPLE.find((x) => x.id === pid)!
      return {
        id: `${id}-${pid}`,
        responder_id: pid,
        status: doneBy.includes(pid) ? 'done' : 'pending',
        total_km: 12,
        started_at: null,
        ended_at: null,
        profile: { full_name: p.full_name, callsign: p.callsign },
      }
    }),
  } as unknown as DevEvent
}

const EVENTS: DevEvent[] = [
  devEvent('e1', '2026-10-12', '70412', 'כביש 6', 'מחלף עירון', 'תאונה', 'צפון', ['p-levi', DEV_VIEWER_ID], ['p-levi']),
  devEvent('e2', '2026-10-20', '70455', 'כביש 65', 'צומת עירון', 'תקוע', 'צפון', ['p-barak'], []),
  devEvent('e3', '2026-11-03', '71020', 'כביש 6', 'מחלף שורק', 'גרירה', 'מרכז', ['p-dana', DEV_VIEWER_ID], ['p-dana', DEV_VIEWER_ID]),
  devEvent('e4', '2026-11-07', null, 'כביש 1', 'מחלף חמד', null, 'מרכז', [DEV_VIEWER_ID], []),
  devEvent('e5', '2026-11-06', '71180', 'כביש 90', 'גשר עין גדי', 'חילוץ', 'דרום', ['p-levi'], []),
]

const ARCHIVE: ArchiveRow[] = [
  { event_fk: 'DEMO-1', event_date: '2025-10-14', event_number: '9001', road: '6', location: 'מחלף עירון', people: '411 יוסי לוי (דוגמה)', cars: '12-345-67', damage: 'פגוש קדמי', found_by: 'כונן: 411 יוסי לוי (דוגמה)', actions: 'פינוי לשול (דוגמה)' },
  { event_fk: 'DEMO-2', event_date: '2025-08-02', event_number: '9002', road: '90', location: 'גשר עין גדי', people: '412 יוסי ברק (דוגמה)', cars: '45-678-90', damage: '', found_by: 'מיקום: גשר עין גדי', actions: 'גרירה (דוגמה)' },
  { event_fk: 'DEMO-3', event_date: '2025-10-30', event_number: '9003', road: '65', location: 'צומת עירון', people: '411 יוסי לוי (דוגמה)', cars: '', damage: '', found_by: 'כונן: 411 יוסי לוי (דוגמה)', actions: 'הכוונת תנועה (דוגמה)' },
]

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const includes = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase())

function visibleEvents(role: SearchRole): DevEvent[] {
  if (role !== 'responder') return EVENTS
  return EVENTS.filter((e) => e.who.includes(DEV_VIEWER_ID) && eventLifecycle(e).status !== 'draft')
}

function visiblePeople(role: SearchRole): DevPerson[] {
  if (role !== 'responder') return PEOPLE
  const peers = new Set(visibleEvents(role).flatMap((e) => e.who))
  return PEOPLE.filter((p) => p.id === DEV_VIEWER_ID || peers.has(p.id))
}

function personOut(p: DevPerson, role: SearchRole, f?: SmartSearchFilter): PersonHit {
  const base: PersonHit = { id: p.id, full_name: p.full_name, callsign: p.callsign, volunteer_status: p.volunteer_status }
  if (f?.no_shift_from) base.last_shift_date = p.shifts.filter((d) => d < f.no_shift_from!).sort().at(-1) ?? null
  if (role !== 'admin') return base
  return { ...base, phone: p.phone, email: p.email, highest_role: p.highest_role, last_active_at: p.last_active_at }
}

function eventText(e: DevEvent): string {
  return [e.police_event_id, e.road?.name, e.location, e.event_type?.name, e.district_name, ...e.responders.map((r) => `${r.profile?.full_name} ${r.profile?.callsign}`)].join(' ')
}

function foundBy(e: DevEvent, f: SmartSearchFilter): string {
  if (f.person_ids?.length) {
    const r = e.responders.find((x) => f.person_ids!.includes(x.responder_id))
    if (r) return `כונן: ${r.profile?.full_name}`
  }
  if (f.text) {
    const r = e.responders.find((x) => includes(`${x.profile?.full_name} ${x.profile?.callsign}`, f.text!))
    if (r) return `כונן: ${r.profile?.full_name}`
    if (e.police_event_id && includes(e.police_event_id, f.text)) return `מספר אירוע ${e.police_event_id}`
    if (e.location && includes(e.location, f.text)) return `מיקום: ${e.location}`
  }
  if (f.road) return e.road!.name
  if (f.district) return `מחוז: ${e.district_name}`
  return `תאריך ${e.event_date.split('-').reverse().join('.')}`
}

function matchEvents(f: SmartSearchFilter, role: SearchRole): SearchEvent[] {
  if (f.entity === 'people' || f.source === 'archive' || f.volunteer_status || f.no_shift_from) return []
  return visibleEvents(role)
    .filter((e) => {
      if (f.date_from && e.event_date < f.date_from) return false
      if (f.date_to && e.event_date > f.date_to) return false
      if (f.district && e.district_name !== f.district) return false
      if (f.event_type && e.event_type?.name !== f.event_type) return false
      if (f.road && !e.road!.name.replace(/\D/g, ' ').split(' ').includes(f.road)) return false
      if (f.person_ids?.length && !e.who.some((id) => f.person_ids!.includes(id))) return false
      if (!f.person_ids?.length && f.person && !e.responders.some((r) => includes(r.profile?.full_name ?? '', f.person!))) return false
      if (f.text && !f.text.split(/\s+/).every((w) => includes(eventText(e), w))) return false
      if (f.vehicle_text || f.plate) return false
      return true
    })
    .map((e) => ({ ...e, found_by: foundBy(e, f) }))
}

function matchPeople(f: SmartSearchFilter, role: SearchRole): PersonHit[] {
  if (f.entity === 'events') return []
  const words = f.person ?? f.text
  if (!words && !f.person_ids?.length && !f.volunteer_status && !f.no_shift_from) return []
  return visiblePeople(role)
    .filter((p) => {
      if (f.person_ids?.length) return f.person_ids.includes(p.id)
      if (f.volunteer_status && p.volunteer_status !== f.volunteer_status) return false
      if (f.no_shift_from && p.shifts.some((d) => d >= f.no_shift_from! && d <= f.no_shift_to!)) return false
      if (!words) return true
      const hay = `${p.full_name} ${p.callsign}${role === 'admin' ? ` ${p.phone}` : ''}`
      return words.split(/\s+/).every((w) => includes(hay, w))
    })
    .map((p) => personOut(p, role, f))
}

function matchArchive(f: SmartSearchFilter): ArchiveRow[] {
  if (f.entity === 'people' || f.source === 'new') return []
  return ARCHIVE.filter((a) => {
    if (f.date_from && a.event_date < f.date_from) return false
    if (f.date_to && a.event_date > f.date_to) return false
    if (f.person_callsigns?.length) return f.person_callsigns.some((cs) => a.people.includes(cs))
    if (f.text) return f.text.split(/\s+/).every((w) => includes(`${a.location} ${a.people} ${a.event_number}`, w))
    return Boolean(f.date_from || f.road || f.district)
  })
}

const MODEL: Record<string, Partial<SmartSearchFilter>> = {
  [DEV_SENTENCES.person]: { entity: 'events', person: 'יוסי', district: 'צפון', date_from: '2026-10-01', date_to: '2026-10-31' },
  [DEV_SENTENCES.shifts]: { entity: 'people', volunteer_status: 'active_volunteer', no_shift_from: '2026-11-08', no_shift_to: '2026-11-14' },
  [DEV_SENTENCES.none]: { entity: 'events', vehicle_text: 'סוזוקי ירוקה suzuki', road: '90', date_from: '2026-11-07', date_to: '2026-11-07' },
}

export function devSearchApi(role: SearchRole, options: { slow?: boolean } = {}): SearchApi {
  const delay = options.slow ? 900 : 120
  return {
    async interpretQuery(q, opts): Promise<Interpretation> {
      await wait(delay)
      const log = Promise.resolve('dev-log')
      if (isBlankQuery(q)) return { filter: directFilter(q), lane: 'direct', logId: Promise.resolve(null) }
      if (q.length > 300) return { filter: directFilter(q), lane: 'direct', logId: log, error: 'query_too_long' }
      if (isDirectQuery(q)) return { filter: directFilter(q), lane: 'direct', logId: log }
      if (!opts.forceModel) {
        const rules = parseRules(q, DEV_TODAY, VOCAB, opts.role)
        if (rules.covered) return { filter: rules.filter, lane: 'rules', logId: log }
      }
      const model = MODEL[q.trim()]
      if (model) return { filter: { intent: 'find', entity: 'both', source: 'both', ...model }, lane: 'ai', logId: log }
      return { filter: directFilter(q), lane: 'fallback', logId: log, reason: 'not_configured' }
    },
    async runSearch(input, limit, opts) {
      await wait(delay)
      const { filter: f, dropped } = filterForRole(input, opts.role)
      return {
        events: matchEvents(f, opts.role).slice(0, limit),
        people: matchPeople(f, opts.role).slice(0, limit),
        archive: opts.role === 'admin' ? matchArchive(f).slice(0, limit) : [],
        dropped,
      }
    },
    async suggest(q) {
      await wait(delay)
      const text = q.trim()
      const short = text.length <= 2
      const people = visiblePeople(role)
        .filter((p) =>
          short
            ? p.full_name.split(/\s+/).some((w) => w.startsWith(text)) || p.callsign.startsWith(text)
            : text.split(/\s+/).every((w) => includes(`${p.full_name} ${p.callsign}`, w)),
        )
        .slice(0, 5)
        .map((p) => ({ ...personOut(p, role), found_by: /^\d+$/.test(text) ? `או״ק ${p.callsign}` : null }))
      const events = short ? [] : matchEvents({ intent: 'find', entity: 'both', source: 'new', text }, role).slice(0, 5)
      return { people, events }
    },
    async suggestArchive(q) {
      await wait(delay * 2)
      return matchArchive({ intent: 'find', entity: 'events', source: 'archive', text: q.trim() }).slice(0, 5)
    },
    async resolvePeople(name, r) {
      await wait(delay)
      return visiblePeople(r)
        .filter((p) => name.split(/\s+/).every((w) => includes(p.full_name, w)))
        .map((p) => personOut(p, r))
    },
    async fetchSearchVocab() {
      return VOCAB
    },
    async reportCounts() {},
    async reportChipRemoved() {},
    async fetchFirstNewEventDate() {
      return '2026-11-01'
    },
  }
}
