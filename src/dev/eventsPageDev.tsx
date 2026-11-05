// DEV-ONLY harness: renders the REAL EventsPage (unit scope) with a mocked auth context
// and an in-memory data boundary (the page's `api` prop), so the filters and saved views
// can be exercised without logging in. Served at /events-page-dev.html. Not in the app bundle.
//
// ?role=shift_lead (default) · admin · admin_lead   ?state=ready (default) · loading · error
// ?table=1 forces the desktop table, ?table=0 the cards (default: table at ≥1025 px).
// Saved views go to this browser's localStorage, as they do before the migration is applied.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AuthState } from '../lib/auth'
import { activeRules, type FilterRule } from '../lib/eventFilters'
import { readLocalPresets, writeLocalPresets } from '../lib/eventFilterPresets'
import type { EventListItem } from '../lib/events'
import { useIsDesktop } from '../lib/useMediaQuery'
import { ToastProvider } from '../components/ui/Toast'
import { EventsPage, type EventsPageApi } from '../pages/EventsPage'
import '../index.css'

const params = new URLSearchParams(window.location.search)
const ROLE_SETS: Record<string, string[]> = {
  shift_lead: ['shift_lead', 'responder'],
  admin: ['admin'],
  admin_lead: ['admin', 'shift_lead'],
}
const roleKey = params.get('role') && ROLE_SETS[params.get('role')!] ? params.get('role')! : 'shift_lead'
const state = params.get('state') ?? 'ready'
const tableParam = params.get('table')
const ME = 'dev-lead'

const LEADS = [
  { id: ME, full_name: 'אבי לוי', callsign: '101' },
  { id: 'dev-dan', full_name: 'דני כהן', callsign: '214' },
  { id: 'dev-noa', full_name: 'נועה פרץ', callsign: '330' },
]
const RESPONDERS = [
  { id: 'dev-r1', full_name: 'רונית לוי', callsign: '318' },
  { id: 'dev-r2', full_name: 'יוסי מזרחי', callsign: '402' },
  { id: 'dev-r3', full_name: 'מאיה שושן', callsign: '515' },
]
const KINDS = [
  { id: 'kind-car', label: 'רכב פרטי' },
  { id: 'kind-truck', label: 'משאית' },
  { id: 'kind-moto', label: 'אופנוע' },
  { id: 'kind-bus', label: 'אוטובוס' },
]
const TYPES = ['פינוי רכב', 'חילוץ רכב', 'סיוע לנהג', 'גרירה']
const ROADS = ['כביש 6', 'כביש 1', 'כביש 531', 'כביש 4']
const STATUSES: EventListItem['status'][] = ['done', 'partial', 'in_progress', 'done', 'draft']

type Meta = { plates: string[]; kinds: string[] }
const META = new Map<string, Meta>()
const now = Date.now()

function fixture(i: number): EventListItem {
  const lead = LEADS[i % LEADS.length]!
  const created = new Date(now - i * 7 * 60 * 60 * 1000)
  const shiftBorn = i % 9 === 8
  const crew = [RESPONDERS[i % 3]!, ...(i % 4 === 0 ? [RESPONDERS[(i + 1) % 3]!] : [])]
  const id = `dev-event-${i}`
  META.set(id, {
    plates: [String(1234560 + i * 37), ...(i % 5 === 0 ? [String(7654300 + i)] : [])],
    kinds: [KINDS[i % KINDS.length]!.id, ...(i % 6 === 0 ? ['kind-truck'] : [])],
  })
  return {
    id,
    shift_lead_id: lead.id,
    created_at: created.toISOString(),
    event_date: created.toISOString().slice(0, 10),
    police_event_id: i % 7 === 3 ? null : String(48200 + i),
    patrol_callsign: `ניידת ${20 + (i % 5)}`,
    location: i % 3 === 0 ? 'מחלף רעננה צפון' : 'צומת כפר סבא',
    status: STATUSES[i % STATUSES.length]!,
    is_cancelled: false,
    origin: shiftBorn ? 'shift' : 'manual',
    shift_id: shiftBorn ? 'dev-shift-1' : null,
    treatment_detail: 'פינוי לשול',
    treatment_notes: null,
    emergency_means: false,
    district: { name: 'שרון' },
    event_type: { name: TYPES[i % TYPES.length]! },
    road: { name: ROADS[i % ROADS.length]! },
    shift_lead: { full_name: lead.full_name, callsign: lead.callsign },
    last_saved: null,
    shift: shiftBorn
      ? {
          shift_date: created.toISOString().slice(0, 10),
          shift_kind: 'morning',
          vehicle_type: 'unit',
          personal_vehicle: null,
        }
      : null,
    shared_treated: [],
    responders: crew.map((person, n) => ({
      id: `${id}-r${n}`,
      responder_id: person.id,
      status: i % 2 === 0 ? 'done' : 'pending',
      total_km: 14,
      started_at: created.toISOString(),
      ended_at: created.toISOString(),
      profile: { full_name: person.full_name, callsign: person.callsign },
    })),
  } as unknown as EventListItem
}

const EVENTS = Array.from({ length: 60 }, (_, i) => fixture(i))
const newestFirst = (a: EventListItem, b: EventListItem) =>
  a.event_date !== b.event_date
    ? a.event_date < b.event_date
      ? 1
      : -1
    : (b.created_at ?? '').localeCompare(a.created_at ?? '')

function matches(event: EventListItem, rule: FilterRule): boolean {
  const meta = META.get(event.id)!
  switch (rule.field) {
    case 'shift_lead':
      return rule.value.includes(event.shift_lead_id ?? '')
    case 'responder':
      return event.responders.some((row) =>
        [row.profile?.full_name, row.profile?.callsign].some((text) => text?.includes(rule.value)),
      )
    case 'event_id':
      return rule.op === 'is'
        ? event.police_event_id === rule.value
        : Boolean(event.police_event_id?.includes(rule.value))
    case 'event_date': {
      const { from, to } = rule.value
      if (rule.op === 'on') return event.event_date === from
      return (!from || event.event_date >= from) && (!to || event.event_date <= to)
    }
    case 'treated_plate':
      return meta.plates.some((plate) => plate.includes(rule.value))
    case 'vehicle_kind':
      return meta.kinds.some((kind) => rule.value.includes(kind))
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const never = () => new Promise<never>(() => {})
const presetUser = `dev-harness-${roleKey}`

const api: EventsPageApi = {
  async fetchEvents(opts) {
    await wait(250)
    if (state === 'loading') return never()
    if (state === 'error') throw new Error('dev: load failed')
    return EVENTS.filter((event) => !opts?.shiftLeadId || event.shift_lead_id === opts.shiftLeadId)
      .sort(newestFirst)
      .slice(0, opts?.limit ?? EVENTS.length)
  },
  async fetchRuleFilteredEvents(rules, opts) {
    await wait(350)
    if (state === 'loading') return never()
    if (state === 'error') throw new Error('dev: rules query failed')
    const active = activeRules(rules)
    const rows = EVENTS.filter(
      (event) =>
        (!opts.shiftLeadId || event.shift_lead_id === opts.shiftLeadId) &&
        (opts.status === 'all' || event.status === opts.status) &&
        (!opts.hideShiftEvents || event.origin !== 'shift') &&
        (!opts.ids || opts.ids.includes(event.id)) &&
        active.every((rule) => matches(event, rule)),
    ).sort(newestFirst)
    return { events: rows.slice(0, opts.limit), capped: rows.length > opts.limit }
  },
  async fetchEventsByIds(ids) {
    return EVENTS.filter((event) => ids.includes(event.id)).sort(newestFirst)
  },
  async fetchMyEvents() {
    return []
  },
  async searchUnitEventIds(needle) {
    await wait(200)
    return EVENTS.filter((event) =>
      [
        event.police_event_id,
        event.road?.name,
        event.location,
        ...event.responders.map((row) => row.profile?.full_name),
      ].some((text) => text?.includes(needle)),
    ).map((event) => event.id)
  },
  async deleteEvent() {
    return { ok: true }
  },
  async fetchEventsMissingLeadKmCount() {
    return 0
  },
  async fetchEventIdsWithMedia() {
    return new Set<string>()
  },
  async fetchFilterLookups() {
    await wait(300)
    return {
      shiftLeads: LEADS.map((lead) => ({ id: lead.id, label: `${lead.full_name} · ${lead.callsign}` })),
      vehicleKinds: KINDS,
    }
  },
  async listPresets() {
    return readLocalPresets(presetUser)
  },
  async savePreset(_userId, name, view) {
    await wait(300)
    const saved = { id: `local:${Date.now().toString(36)}`, name: name.trim(), view }
    writeLocalPresets(presetUser, [...readLocalPresets(presetUser), saved])
    return saved
  },
  async deletePreset(_userId, id) {
    await wait(200)
    writeLocalPresets(
      presetUser,
      readLocalPresets(presetUser).filter((preset) => preset.id !== id),
    )
  },
}

const mockAuth = {
  session: null,
  user: { id: ME },
  profile: { id: ME, full_name: 'אבי לוי', callsign: '101', active: true },
  roles: ROLE_SETS[roleKey],
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

function DevBar() {
  const link = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    return `?${next.toString()}`
  }
  return (
    <nav
      aria-label="מצבי פיתוח"
      className="t-caption"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        marginBlockEnd: 'var(--space-4)',
        border: '1px dashed var(--stroke-strong)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span>מסך פיתוח: עמוד האירועים האמיתי עם נתונים מדומים.</span>
      {Object.keys(ROLE_SETS).map((key) => (
        <a key={key} href={link('role', key)} aria-current={key === roleKey ? 'page' : undefined}>
          {key}
        </a>
      ))}
      {['ready', 'loading', 'error'].map((key) => (
        <a key={key} href={link('state', key)} aria-current={key === state ? 'page' : undefined}>
          {key}
        </a>
      ))}
    </nav>
  )
}

function Harness() {
  const isDesktop = useIsDesktop()
  const asTable = tableParam === null ? isDesktop : tableParam === '1'
  return (
    <div className="shell dev-shell" data-theme="field">
      <main className="shell__main">
        <DevBar />
        <EventsPage
          scope="unit"
          asTable={asTable}
          canCreate
          onOpen={(id) => console.info('[dev] open event', id)}
          onCreate={() => console.info('[dev] create event')}
          api={api}
        />
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={mockAuth}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </AuthContext.Provider>
  </StrictMode>,
)
