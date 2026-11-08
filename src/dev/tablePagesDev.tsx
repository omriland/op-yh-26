// DEV-ONLY harness: renders the REAL table pages with a mocked super-admin auth context
// and a faked Supabase client (from / rpc / functions / auth), so every table can be
// screenshotted without logging in. Served at /table-pages-dev.html. Not in the app bundle.
//
// ?page=contacts (default) · users · fuel-refund · fuel-usage · fuel-quarter · duplicates ·
//       km-exceptions · audit · locations · shifts · report (&kind=km_exceptions | duplicate_events)
// ?state=ready (default) · loading · error · empty
//
// No request leaves the page: unknown tables / RPCs log a console.warn and return no
// rows, Edge Functions answer with an error, and cross-origin fetch() is answered locally.
// The Supabase client still needs a URL at import time; without a .env.local run:
//   VITE_SUPABASE_URL=https://dev-harness.invalid VITE_SUPABASE_ANON_KEY=dev npx vite

import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AuthState } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { defaultFuelQuarter } from '../lib/fuelQuarterMath'
import { useIsDesktop } from '../lib/useMediaQuery'
import { reportKindById } from '../lib/reports/registry'
import { ToastProvider } from '../components/ui/Toast'
import { ContactsPage } from '../pages/ContactsPage'
import { AdminUsersPage } from '../pages/AdminUsersPage'
import { FuelRefundPage } from '../pages/FuelRefundPage'
import { FuelUsagePanel } from '../components/admin/FuelUsagePanel'
import { FuelQuarterWorkbook } from '../components/admin/FuelQuarterWorkbook'
import { DuplicateEventsPage } from '../pages/DuplicateEventsPage'
import { KmExceptionsPage } from '../pages/KmExceptionsPage'
import { EventAuditPage } from '../pages/EventAuditPage'
import { EventLocationsPage } from '../pages/EventLocationsPage'
import { ShiftsPage } from '../pages/ShiftsPage'
import { ReportRunner } from '../components/reports/ReportRunner'
import '../index.css'

const PAGES = [
  'contacts', 'users', 'fuel-refund', 'fuel-usage', 'fuel-quarter', 'duplicates',
  'km-exceptions', 'audit', 'locations', 'shifts', 'report',
] as const
type DevPage = (typeof PAGES)[number]
const STATES = ['ready', 'loading', 'error', 'empty'] as const
type DevState = (typeof STATES)[number]
const REPORT_IDS = ['km_exceptions', 'duplicate_events'] as const

const params = new URLSearchParams(window.location.search)
const page: DevPage = (PAGES as readonly string[]).includes(params.get('page') ?? '')
  ? (params.get('page') as DevPage)
  : 'contacts'
const state: DevState = (STATES as readonly string[]).includes(params.get('state') ?? '')
  ? (params.get('state') as DevState)
  : 'ready'
const kindId = params.get('kind') ?? 'km_exceptions'

// ---------------------------------------------------------------- fixture helpers

const pad2 = (n: number) => String(n).padStart(2, '0')
const now = new Date()
/** Local YYYY-MM-DD, n days before today. */
function daysAgo(n: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
/** ISO timestamp, n days before today at hh:mm local. */
function isoAt(n: number, hh: number, mm: number): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, hh, mm).toISOString()
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

const PEOPLE = [
  ['אבי לוי', '101', 'avi.levi'],
  ['דני כהן', '214', 'dani.cohen'],
  ['נועה פרץ', '330', 'noa.peretz'],
  ['רונית לוי', '318', 'ronit.levi'],
  ['יוסי מזרחי', '402', 'yossi.mizrahi'],
  ['מאיה שושן', '515', 'maya.shoshan'],
  ['אלון ברק', '7', 'alon.barak'],
  ['שירה אדלר', '62', 'shira.adler'],
  ['עומר חדד', '1203', 'omer.hadad'],
  ['תמר גולן', '88', 'tamar.golan'],
  ['איתי רוזן', '240', 'itay.rozen'],
  ['ליאת בן דוד', '19', 'liat.bendavid'],
  ['משה אברהם', '611', 'moshe.avraham'],
  ['הילה נחום', '305', 'hila.nahum'],
  ['גיל שפירא', '43', 'gil.shapira'],
  ['רותם קפלן', '927', 'rotem.kaplan'],
  ['יעל דהן', '150', 'yael.dahan'],
  ['עידו סגל', '3', 'ido.segal'],
  ['מיכל אוחיון', '712', 'michal.ohayon'],
  ['אורי טל', '256', 'uri.tal'],
  ['נטע ביטון', '481', 'neta.biton'],
  ['בועז פרידמן', '33', 'boaz.friedman'],
  ['ענבל חזן', '1010', 'inbal.hazan'],
  ['שי אלמוג', '577', 'shai.almog'],
  ['דורית וקנין', '96', 'dorit.vaknin'],
].map(([full_name, callsign, handle], i) => ({
  id: `dev-p-${i}`,
  full_name: full_name!,
  callsign: callsign!,
  email: `${handle}@yahpaz.dev`,
  phone: i % 9 === 5 ? null : `05${(i * 7) % 10}${String(4120000 + i * 371_17).slice(-7)}`,
}))
const person = (i: number) => PEOPLE[i % PEOPLE.length]!
const brief = (i: number) => ({ full_name: person(i).full_name, callsign: person(i).callsign })

const LOCATIONS = [
  'מחלף רעננה צפון', 'צומת כפר סבא', 'מחלף גלילות', 'כביש 6 ק״מ 112', 'צומת רעננה מערב',
  'מחלף השבעה', 'מחלף קסם', 'צומת הדר עם', 'גשר הירקון', 'מחלף שבעת הכוכבים, לפני היציאה לכביש 4',
]
const ROADS = ['כביש 6', 'כביש 1', 'כביש 531', 'כביש 4', 'כביש 2', 'כביש 20']
const TYPES = ['פינוי רכב', 'חילוץ רכב', 'סיוע לנהג', 'גרירה', 'החלפת גלגל', 'מפגע בציר']
const KM = [3, 480, 12, 96, 27, 140, 8, 61, 215, 34, 5, 118, 44, 302, 19, 73]
const police = (i: number) => (i % 8 === 6 ? null : String(48_210 + i * 137))

// ---------------------------------------------------------------- tables

const ROLES: Record<number, string[]> = { 0: ['admin', 'super_admin'], 1: ['admin'], 2: ['shift_lead'], 5: ['shift_lead'], 9: ['shift_lead'] }
const VOLUNTEER = ['active_volunteer', 'active_volunteer', 'shifts_only', 'phone_training', 'basic_training', 'personal_vehicle_training', 'administration']

const profiles = PEOPLE.map((p, i) => ({
  ...p,
  active: i % 11 !== 10,
  invite_pending: i === 23 || i === 17,
  otp_login_enabled: i % 4 === 0,
  otp_users_page_enabled: i === 0,
  volunteer_status: VOLUNTEER[i % VOLUNTEER.length],
  availability: i % 6 === 3 ? 'unavailable' : 'available',
  available_from: i % 6 === 3 ? daysAgo(-5 - i) : null,
  last_android_seen_at: i % 3 === 0 ? isoAt(i % 9, 9, 30) : null,
  last_android_version_code: i % 3 === 0 ? 70 + (i % 3) : null,
  last_android_version_name: i % 3 === 0 ? `0.3.${56 + (i % 3)}` : null,
}))

const userRoles = PEOPLE.flatMap((p, i) =>
  [...(ROLES[i] ?? []), 'responder'].map((role) => ({ user_id: p.id, role })),
)
const vehicles = PEOPLE.flatMap((p, i) =>
  i % 3 === 1
    ? []
    : [{ id: `dev-v-${i}`, user_id: p.id, plate_number: String(1_234_560 + i * 731), model: ['סוזוקי סוויפט', 'יונדאי i20', 'טויוטה קורולה', 'קיה פיקנטו'][i % 4], archived: i % 10 === 4 }],
)
const userAddresses = PEOPLE.flatMap((p, i) =>
  i % 4 === 2
    ? []
    : [{ id: `dev-a-${i}`, user_id: p.id, kind: 'home', label: null, formatted_address: `${['הרצל', 'ויצמן', 'אחוזה', 'בן גוריון'][i % 4]} ${i + 3}, ${['רעננה', 'כפר סבא', 'הוד השרון', 'הרצליה'][i % 4]}`, place_id: `dev-place-${i}`, lat: 32.18 + i * 0.002, lng: 34.87 + i * 0.002 }],
)
const lastSignIn = PEOPLE.map((p, i) => ({ user_id: p.id, last_sign_in_at: i % 7 === 6 ? null : isoAt(i % 19, 8 + (i % 10), (i * 7) % 60) }))
const lastActive = PEOPLE.map((p, i) => ({ user_id: p.id, last_active_at: i % 5 === 4 ? null : new Date(Date.now() - (i * i + 1) * 9 * 60 * 1000).toISOString() }))

const contacts = PEOPLE.filter((_, i) => i % 11 !== 10).map(({ id, full_name, callsign, phone, email }) => ({ id, full_name, callsign, phone, email }))

/** Participations: one superset row serves fuel refund, fuel detail and the quarter workbook. */
const eventResponders = range(44).map((i) => {
  const day = (i * 5) % 26
  const frozen = i === 7 || i === 30
  return {
    id: `dev-er-${i}`,
    responder_id: person(i % 21).id,
    event_id: `dev-fuel-event-${Math.floor(i / 2)}`,
    total_km: i % 13 === 12 ? 0 : KM[i % KM.length]!,
    status: i % 9 === 8 ? 'pending' : 'done',
    started_at: isoAt(day, 6 + (i % 14), (i * 11) % 60),
    frozen_over_60km: frozen,
    frozen_suspicious_duplicate: false,
    events: {
      created_at: isoAt(day, 6 + (i % 14), (i * 11) % 60),
      origin: 'manual',
      status: 'done',
      location: `${ROADS[i % ROADS.length]} · ${LOCATIONS[i % LOCATIONS.length]}`,
      notes: i % 4 === 0 ? 'רכב תקוע בנתיב השמאלי' : null,
      frozen_over_60km: frozen,
      frozen_suspicious_duplicate: false,
      event_type: { name: TYPES[i % TYPES.length] },
    },
    profile: brief(i % 21),
  }
})

const SHIFT_KINDS = ['morning', 'midday', 'reinforcement', 'escort', 'other']
const VEHICLE_TYPES = ['patrol_north', 'patrol_center', 'personal']
const SHIFT_STATUSES = ['closed', 'closed', 'in_progress', 'closed', 'draft']
const shifts = range(22).map((i) => {
  const date = daysAgo(Math.floor(i * 1.2))
  const vehicle_type = VEHICLE_TYPES[i % 3]!
  const odometer_start = i % 6 === 5 ? null : 84_000 + i * 913
  const km = KM[(i + 3) % KM.length]!
  return {
    id: `dev-shift-${i}`,
    shift_date: date,
    created_at: isoAt(Math.floor(i * 1.2), 7, 0),
    shift_kind: SHIFT_KINDS[i % SHIFT_KINDS.length],
    vehicle_type,
    status: SHIFT_STATUSES[i % SHIFT_STATUSES.length],
    odometer_start,
    odometer_end: odometer_start == null || i % 5 === 2 ? null : odometer_start + km,
    total_km: vehicle_type === 'personal' ? km : null,
    personal_vehicle_id: vehicle_type === 'personal' ? `dev-v-${i}` : null,
    vehicles: vehicle_type === 'personal' ? { user_id: person(i).id } : null,
    personal_vehicle: vehicle_type === 'personal' ? { plate_number: String(1_234_560 + i * 731) } : null,
    shift_lead: brief([0, 2, 5, 9][i % 4]!),
    responders: range(1 + (i % 3)).map((n) => ({ id: `dev-sr-${i}-${n}`, responder_id: person(i + n + 3).id })),
    linked_events: i % 4 === 1 ? [{ id: `dev-se-${i}`, event_id: `dev-loc-event-${i}` }] : [],
    born_events: range(i % 4).map((n) => ({
      id: `dev-born-${i}-${n}`,
      event_date: date,
      police_event_id: police(i + n),
      status: n === 0 ? 'done' : 'partial',
      treatment_detail: 'פינוי לשול',
      treatment_notes: null,
      road_id: null,
      location: LOCATIONS[(i + n) % LOCATIONS.length],
      emergency_means: n === 2,
      frozen_over_60km: false,
      frozen_suspicious_duplicate: false,
      responders: [{ responder_id: person(i + 3).id, frozen_over_60km: false, frozen_suspicious_duplicate: false }],
      event_type: { name: TYPES[(i + n) % TYPES.length] },
      last_saved: { full_name: person(i).full_name },
      treated: range(n).map((t) => ({ id: `dev-t-${i}-${n}-${t}` })),
    })),
    last_saved: i % 3 === 0 ? null : { full_name: person(i + 1).full_name },
  }
})

const { year: QY, quarter: QQ } = defaultFuelQuarter()
const PREV = QQ === 1 ? { year: QY - 1, quarter: 4 } : { year: QY, quarter: QQ - 1 }
const fuelQuarters = [
  { id: 'dev-q-prev', year: PREV.year, quarter: PREV.quarter, status: 'locked' },
  { id: 'dev-q-current', year: QY, quarter: QQ, status: 'draft' },
]
const fuelQuarterDistributions = [
  ...range(9).map((i) => ({ quarter_id: 'dev-q-prev', responder_id: person(i * 2).id, remaining_km: [40, -25, 310, 0, 75, 12, -60, 150, 5][i], cards: 0, card_numbers: '' })),
  ...range(6).map((i) => ({ quarter_id: 'dev-q-current', responder_id: person(i * 3).id, remaining_km: 0, cards: i % 3, card_numbers: range(i % 3).map((c) => String(70_011_200 + i * 10 + c)).join('\n') })),
]

/** Duplicates: pairs / triples sharing responder, date and place within 30 minutes. */
const duplicateEvents = range(9).flatMap((c) => {
  const size = c % 4 === 1 ? 3 : 2
  const date = daysAgo(c * 3)
  const responder = person(c * 2 + 1)
  return range(size).map((m) => ({
    id: `dev-dup-${c}-${m}`,
    event_date: date,
    created_at: isoAt(c * 3, 8 + c, m * 12),
    is_cancelled: c === 5 && m === 1,
    police_event_id: m === 1 && c % 3 === 0 ? null : police(c * 3 + m),
    location: LOCATIONS[c % LOCATIONS.length],
    frozen_over_60km: false,
    frozen_suspicious_duplicate: c !== 7,
    approved_suspicious_duplicate: c === 8,
    event_type: { name: TYPES[(c + m) % TYPES.length] },
    road: c % 4 === 2 ? null : { name: ROADS[c % ROADS.length] },
    responders: [
      { responder_id: responder.id, started_at: isoAt(c * 3, 8 + c, m * 12), profile: brief(c * 2 + 1) },
      ...(m === 0 ? [{ responder_id: person(c + 14).id, started_at: isoAt(c * 3, 14, 0), profile: brief(c + 14) }] : []),
    ],
  }))
})

/** Km exceptions: most in this month (the report filters by month-to-date). */
const kmEvents = range(20).map((i) => {
  const day = i < 14 ? Math.floor(i / 2) : 6 + i
  return {
    id: `dev-km-${i}`,
    event_date: daysAgo(day),
    is_cancelled: i === 9,
    police_event_id: police(i),
    location: LOCATIONS[i % LOCATIONS.length],
    frozen_over_60km: true,
    frozen_suspicious_duplicate: i % 7 === 3,
    event_type: { name: TYPES[i % TYPES.length] },
    road: i % 5 === 4 ? null : { name: ROADS[i % ROADS.length] },
    shift_lead: brief([0, 2, 5, 9][i % 4]!),
    responders: [
      { status: 'done', total_km: [80, 96, 140, 215, 302, 480, 118, 88, 155, 260][i % 10], frozen_over_60km: true, frozen_suspicious_duplicate: i % 7 === 3, profile: brief(i + 4) },
      ...(i % 3 === 0 ? [{ status: 'pending', total_km: 24, frozen_over_60km: false, frozen_suspicious_duplicate: false, profile: brief(i + 8) }] : []),
    ],
  }
})

/** Locations queue: 62 rows, so the first page of 50 is full and "טען עוד" shows. */
const PIN_SOURCES = ['places', 'geocode', 'shift_lead', 'responder', null]
const locationEvents = range(62).map((i) => {
  const missing = i % 3 === 1
  return {
    id: `dev-loc-event-${i}`,
    event_date: daysAgo(Math.floor(i / 3)),
    created_at: isoAt(Math.floor(i / 3), 7 + (i % 12), (i * 13) % 60),
    police_event_id: police(i),
    location: i % 10 === 9 ? null : LOCATIONS[i % LOCATIONS.length],
    location_place_id: missing ? null : `dev-place-${i}`,
    location_lat: missing ? null : 32.1 + (i % 17) * 0.01,
    location_lng: missing ? null : 34.85 + (i % 13) * 0.01,
    location_pin_source: missing ? null : PIN_SOURCES[i % PIN_SOURCES.length],
    status: (['done', 'partial', 'in_progress', 'done', 'draft'] as const)[i % 5],
    is_cancelled: false,
    bus_lane: i % 11 === 3,
    road: i % 7 === 6 ? null : { name: ROADS[i % ROADS.length] },
    event_type: { name: TYPES[i % TYPES.length] },
    shift_lead: brief([0, 2, 5, 9][i % 4]!),
    secondary_leads: [],
    responders: range(1 + (i % 2)).map((n) => ({ id: `dev-loc-r-${i}-${n}` })),
  }
})

/** Event audit: 62 rows (first page of 50 is full). */
// UUID-shaped ids: an event without a police number falls back to showing its id.
const auditEvents = range(20).map((i) => ({ id: `9b1d7c40-2e6a-4f3b-8c21-${String(i).padStart(12, '0')}`, police_event_id: police(i + 3) }))
const EVENT_CHANGES: [string, unknown, unknown][] = [
  ['status', 'draft', 'in_progress'],
  ['location', 'צומת כפר סבא', 'מחלף רעננה צפון'],
  ['police_event_id', null, '48771'],
  ['notes', '', 'הנהג המתין לגרר כשעה'],
  ['is_cancelled', false, true],
  ['status', 'in_progress', 'done'],
]
const RESPONDER_CHANGES: [string, unknown, unknown][] = [
  ['total_km', 12, 48],
  ['status', 'pending', 'done'],
  ['vehicle_plate', null, '12-345-67'],
  ['total_km', 96, 310],
]
const eventAudit = range(62).map((i) => {
  const table_name = i % 3 === 0 ? 'event_responders' : 'events'
  const op = i % 7 === 0 ? 'INSERT' : i % 11 === 5 ? 'DELETE' : 'UPDATE'
  const changes = table_name === 'events' ? EVENT_CHANGES : RESPONDER_CHANGES
  const [key, before, after] = changes[i % changes.length]!
  const second = i % 4 === 2 ? changes[(i + 1) % changes.length]! : null
  const orphan = i % 13 === 0
  const event_id = orphan ? `dev-deleted-event-${i}` : auditEvents[i % auditEvents.length]!.id
  const base = { id: `row-${i}`, police_event_id: orphan ? String(47_000 + i) : undefined }
  const oldRow = { ...base, [key]: before, ...(second ? { [second[0]]: second[1] } : {}) }
  const newRow = { ...base, [key]: after, ...(second ? { [second[0]]: second[2] } : {}), updated_at: isoAt(0, 9, 0) }
  return {
    id: `dev-audit-${i}`,
    table_name,
    row_id: `row-${i}`,
    event_id,
    op,
    actor_id: i % 9 === 4 ? null : person(i % 12).id,
    changed_at: new Date(Date.now() - i * 3.1 * 60 * 60 * 1000).toISOString(),
    old_row: op === 'INSERT' ? null : oldRow,
    new_row: op === 'DELETE' ? null : newRow,
    changed_fields: op === 'UPDATE' && i % 2 === 0 ? [key, ...(second ? [second[0]] : []), 'updated_at'] : null,
  }
})

const eventsByPage: Partial<Record<DevPage, unknown[]>> = {
  duplicates: duplicateEvents,
  'km-exceptions': kmEvents,
  locations: locationEvents,
  audit: auditEvents,
  report: kindId === 'duplicate_events' ? duplicateEvents : kmEvents,
}

const TABLES: Record<string, unknown[]> = {
  profiles,
  user_roles: userRoles,
  vehicles,
  user_addresses: userAddresses,
  event_responders: eventResponders,
  shifts,
  fuel_quarters: fuelQuarters,
  fuel_quarter_distributions: fuelQuarterDistributions,
  event_audit: eventAudit,
  events: eventsByPage[page] ?? [],
  'rpc:list_unit_contacts': contacts,
  'rpc:admin_list_last_sign_in': lastSignIn,
  'rpc:admin_list_last_active': lastActive,
}

// ---------------------------------------------------------------- fake Supabase client

type Filter = { col: string; kind: 'eq' | 'in' | 'is'; value: unknown }
type Query = {
  source: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  filters: Filter[]
  range?: [number, number]
  limit?: number
  single: boolean
  payload?: unknown
  args?: Record<string, unknown>
}
type Result = { data: unknown; error: { message: string; code: string } | null; count: number | null; status: number }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function rowsFor(q: Query): unknown[] {
  if (q.source === 'rpc:search_unit_shift_ids') {
    const needle = String(q.args?.p_needle ?? '').trim()
    return shifts
      .filter((s) => needle && `${s.shift_lead.full_name} ${s.shift_lead.callsign}`.includes(needle))
      .map((s) => s.id)
  }
  const rows = TABLES[q.source]
  if (!rows) {
    console.warn(`[dev] no fixture for ${q.source}; returning no rows`)
    return []
  }
  return rows.filter((row) =>
    q.filters.every(({ col, kind, value }) => {
      if (!row || typeof row !== 'object' || !(col in row)) return true
      const cell = (row as Record<string, unknown>)[col]
      if (kind === 'in') return (value as unknown[]).includes(cell)
      if (kind === 'is') return value === null ? cell == null : cell === value
      return cell === value
    }),
  )
}

async function execute(q: Query): Promise<Result> {
  if (state === 'loading') return new Promise<Result>(() => {})
  await wait(120)
  if (state === 'error') {
    return { data: null, error: { message: 'dev harness error', code: 'DEV' }, count: null, status: 500 }
  }
  if (q.op !== 'select') {
    const row = { id: 'dev-new', status: 'draft', ...(q.payload as object) }
    return { data: q.single ? row : null, error: null, count: null, status: 200 }
  }
  let rows = state === 'empty' ? [] : rowsFor(q)
  const count = rows.length
  if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1)
  if (q.limit != null) rows = rows.slice(0, q.limit)
  return { data: q.single ? (rows[0] ?? null) : rows, error: null, count, status: 200 }
}

function builder(source: string, args?: Record<string, unknown>): unknown {
  const q: Query = { source, op: 'select', filters: [], single: false, args }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol') return undefined
        switch (prop) {
          case 'then':
            return (onOk: (r: Result) => unknown, onFail?: (e: unknown) => unknown) => execute(q).then(onOk, onFail)
          case 'insert':
          case 'update':
          case 'upsert':
            return (payload: unknown) => {
              q.op = prop
              q.payload = Array.isArray(payload) ? payload[0] : payload
              return proxy
            }
          case 'delete':
            return () => {
              q.op = 'delete'
              return proxy
            }
          case 'eq':
          case 'in':
          case 'is':
            return (col: string, value: unknown) => {
              q.filters.push({ col, kind: prop, value })
              return proxy
            }
          case 'range':
            return (from: number, to: number) => {
              q.range = [from, to]
              return proxy
            }
          case 'limit':
            return (n: number) => {
              q.limit = n
              return proxy
            }
          case 'single':
          case 'maybeSingle':
            return () => {
              q.single = true
              return proxy
            }
          default:
            // select, order, gte, lte, not, or, ilike, abortSignal, ...: ignored.
            return () => proxy
        }
      },
    },
  )
  return proxy
}

const client = supabase as unknown as Record<string, unknown> & { auth: Record<string, unknown> }
client.from = (table: string) => builder(table)
client.rpc = (name: string, args?: Record<string, unknown>) => builder(`rpc:${name}`, args)
// `functions` is a prototype getter that builds a new client each read; shadow it.
Object.defineProperty(client, 'functions', {
  value: {
    invoke: async (name: string) => {
      console.warn(`[dev] Edge Function ${name} is disabled in the harness`)
      return { data: null, error: { message: 'dev: functions disabled' } }
    },
  },
})
client.auth.getSession = async () => ({ data: { session: null }, error: null })
client.auth.getUser = async () => ({ data: { user: null }, error: null })

const realFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href)
  if (url.origin === window.location.origin) return realFetch(input, init)
  console.warn(`[dev] blocked network request to ${url.origin}${url.pathname}`)
  const google = url.hostname.endsWith('googleapis.com')
  return new Response('{}', { status: google ? 200 : 503, headers: { 'Content-Type': 'application/json' } })
}

// ---------------------------------------------------------------- shell

const mockAuth = {
  session: null,
  user: { id: 'dev-admin' },
  profile: {
    id: 'dev-admin',
    full_name: 'מנהל (דמו)',
    email: 'admin@yahpaz.dev',
    callsign: '000',
    phone: null,
    active: true,
    must_change_password: false,
    otp_login_enabled: false,
    // False skips the users-page OTP gate (AdminUsersPage never calls phone-otp).
    otp_users_page_enabled: false,
    availability: 'available',
    available_from: null,
    lifetime_event_count: 0,
    lifetime_km: 0,
    lifetime_stats_updated_at: null,
  },
  roles: ['super_admin', 'admin', 'shift_lead', 'responder'],
  loading: false,
  passwordSetupReason: null,
  authBootstrapError: null,
  reloadProfile: async () => {},
  signIn: async () => ({ error: null }),
  requestPasswordReset: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  redeemInviteToken: async () => ({ error: null }),
  acknowledgePasswordSetup: () => {},
  signOut: async () => {},
} as unknown as AuthState

function href(next: { page?: DevPage; state?: DevState; kind?: string }): string {
  const p = next.page ?? page
  const query = new URLSearchParams({ page: p, state: next.state ?? state })
  if (p === 'report') query.set('kind', next.kind ?? kindId)
  return `?${query}`
}

function DevBar() {
  const style = {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 'var(--space-2)',
  }
  return (
    <nav
      aria-label="מסכי פיתוח"
      className="t-caption"
      style={{
        display: 'grid',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        marginBlockEnd: 'var(--space-4)',
        border: '1px dashed var(--stroke-strong)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={style}>
        <span>מסך פיתוח, טבלאות אמיתיות עם נתונים מדומים:</span>
        {PAGES.map((p) => (
          <a key={p} href={href({ page: p })} aria-current={p === page ? 'page' : undefined}>
            {p}
          </a>
        ))}
      </div>
      <div style={style}>
        <span>מצב:</span>
        {STATES.map((s) => (
          <a key={s} href={href({ state: s })} aria-current={s === state ? 'page' : undefined}>
            {s}
          </a>
        ))}
        {page === 'report' ? (
          <>
            <span>דוח:</span>
            {REPORT_IDS.map((k) => (
              <a key={k} href={href({ kind: k })} aria-current={k === kindId ? 'page' : undefined}>
                {k}
              </a>
            ))}
          </>
        ) : null}
      </div>
    </nav>
  )
}

const log = (what: string) => (id?: string) => console.info(`[dev] ${what}`, id ?? '')

function Page() {
  const isDesktop = useIsDesktop()
  const wide = (node: ReactNode) => <div className={isDesktop ? 'page--wide' : undefined}>{node}</div>
  switch (page) {
    case 'contacts':
      return wide(<ContactsPage />)
    case 'users':
      return (
        <div className="stack-4 page--wide page--users">
          <AdminUsersPage />
        </div>
      )
    case 'fuel-refund':
      return <FuelRefundPage />
    case 'fuel-usage':
      return (
        <div className="stack-4">
          <FuelUsagePanel />
        </div>
      )
    case 'fuel-quarter':
      return (
        <div className="stack-4">
          <FuelQuarterWorkbook />
        </div>
      )
    case 'duplicates':
      return <DuplicateEventsPage asTable={isDesktop} onOpen={log('open event')} />
    case 'km-exceptions':
      return <KmExceptionsPage asTable={isDesktop} onOpen={log('open event')} />
    case 'audit':
      return <EventAuditPage />
    case 'locations':
      return wide(<EventLocationsPage onOpenEvent={log('open event')} />)
    case 'shifts':
      return (
        <ShiftsPage
          scope="unit"
          asTable={isDesktop}
          canManage
          onOpen={log('open shift')}
          onFill={log('fill shift')}
          onCreate={log('create shift')}
        />
      )
    case 'report': {
      const kind = reportKindById(kindId)
      if (!kind) return <p>אין דוח בשם {kindId}</p>
      return (
        <div className={['stack-4', isDesktop ? 'page--wide' : ''].filter(Boolean).join(' ')}>
          <ReportRunner
            kind={kind}
            viewer={{ userId: 'dev-admin', isAdmin: true }}
            asTable={isDesktop}
            onBack={log('back')}
            onOpenEvent={log('open event')}
          />
        </div>
      )
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={mockAuth}>
      <ToastProvider>
        <div className="shell dev-shell" data-theme="field">
          <main className="shell__main">
            <DevBar />
            <Page />
          </main>
        </div>
      </ToastProvider>
    </AuthContext.Provider>
  </StrictMode>,
)
