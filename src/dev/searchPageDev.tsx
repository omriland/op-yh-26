// DEV-ONLY harness: renders the REAL SearchPage with a mocked admin auth context and a
// stubbed data boundary (the page's `api` prop), so every state can be seen without
// logging in. Served at /search-page-dev.html?state=<name>. Not part of the app bundle.
//
// States: idle · loading · results · empty · error · too_long · unsupported · fallback ·
// direct · cap · export. Archive rows open the local legacy sample reports.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AuthState } from '../lib/auth'
import type { EventListItem } from '../lib/events'
import { __setLegacyFixtureProvider, type LegacyReport } from '../lib/reports/legacyReport'
import fixture from '../lib/reports/__fixtures__/legacyReports.sample.json'
import type { ArchiveRow, Interpretation, PersonHit } from '../lib/smartSearchApi'
import { ToastProvider } from '../components/ui/Toast'
import { SearchPage, type SearchApi } from '../pages/SearchPage'
import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import '../index.css'

__setLegacyFixtureProvider(async () => fixture as unknown as LegacyReport[])

const STATES = [
  'idle', 'loading', 'results', 'empty', 'error', 'too_long', 'unsupported', 'fallback', 'direct', 'cap', 'export',
] as const
type DevState = (typeof STATES)[number]

const params = new URLSearchParams(window.location.search)
const state: DevState = (STATES as readonly string[]).includes(params.get('state') ?? '')
  ? (params.get('state') as DevState)
  : 'results'

const QUERIES: Record<DevState, string> = {
  idle: '',
  loading: 'אירוע בכביש 531 בשבוע שעבר',
  results: 'סוזוקי שנפגעה בכביש 531 בשבוע שעבר',
  empty: 'אירוע בכביש 9999',
  error: 'אירוע בכביש 531',
  too_long: 'אירוע '.repeat(60),
  unsupported: 'כמה אירועים היו בכביש 531 בשבוע שעבר',
  fallback: 'סוזוקי לבנה',
  direct: '12-345-67',
  cap: 'כל האירועים השנה',
  export: 'ייצוא האירועים בכביש 531 בשבוע שעבר',
}

const aiFilter: SmartSearchFilter = {
  intent: 'find',
  entity: 'both',
  source: 'both',
  road: '531',
  date_from: '2026-10-25',
  date_to: '2026-10-31',
  vehicle_text: 'סוזוקי',
  plate: '1234567',
  person: 'דני',
  person_role: 'responder',
  damaged: true,
}

function interpretationFor(s: DevState, q: string): Interpretation {
  const direct: SmartSearchFilter = { intent: 'find', entity: 'both', source: 'both', text: q.trim() }
  switch (s) {
    case 'too_long':
      return { filter: direct, lane: 'direct', logId: Promise.resolve(null), error: 'query_too_long' }
    case 'unsupported':
      return { filter: { ...aiFilter, intent: 'unsupported_question' }, lane: 'ai', logId: Promise.resolve('dev') }
    case 'fallback':
      return { filter: direct, lane: 'fallback', logId: Promise.resolve('dev') }
    case 'direct':
      return { filter: direct, lane: 'direct', logId: Promise.resolve('dev') }
    case 'export':
      return { filter: { ...aiFilter, intent: 'export' }, lane: 'ai', logId: Promise.resolve('dev') }
    default:
      return { filter: aiFilter, lane: 'ai', logId: Promise.resolve('dev') }
  }
}

const TYPES = ['חילוץ רכב', 'פינוי ציר', 'סיוע לנהג', 'גרירה']
const STATUSES: EventListItem['status'][] = ['done', 'partial', 'in_progress', 'draft']

function event(i: number): EventListItem & { found_by: string } {
  return {
    id: `dev-event-${i}`,
    event_date: `2026-10-${String(31 - (i % 7)).padStart(2, '0')}`,
    police_event_id: String(48210 + i),
    patrol_callsign: null,
    location: i % 3 === 0 ? 'מחלף רעננה צפון, בכיוון דרום לפני היציאה לכביש 4' : 'צומת כפר סבא',
    status: STATUSES[i % STATUSES.length],
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: { name: 'שרון' },
    event_type: { name: TYPES[i % TYPES.length] },
    road: { name: '531' },
    shift_lead: { full_name: 'דני כהן', callsign: '214' },
    last_saved: null,
    shift: null,
    shared_treated: [],
    responders: [
      {
        id: `dev-r-${i}`,
        responder_id: 'dev-p-1',
        status: i % 2 === 0 ? 'done' : 'pending',
        total_km: 12,
        started_at: null,
        ended_at: null,
        profile: { full_name: 'רונית לוי', callsign: '318' },
      },
    ],
    found_by:
      i % 2 === 0
        ? 'לוחית 12-345-67 · סוזוקי סוויפט · כונן: דני כהן · כביש 531 · תאריך בטווח'
        : 'כונן: דני כהן',
  } as EventListItem & { found_by: string }
}

const DEMO_FKS = ['DEMO-1', 'DEMO-2', 'DEMO-3']

function archiveRow(i: number): ArchiveRow {
  return {
    event_fk: DEMO_FKS[i % DEMO_FKS.length],
    event_date: `2026-10-${String(30 - (i % 6)).padStart(2, '0')}`,
    event_number: String(9001 + i),
    road: '531',
    location: 'מחלף דוגמה צפון',
    people: '214 דני כהן, 318 רונית לוי',
    cars: 'סוזוקי לבנה 1234567 (דוגמה)',
    damage: i % 2 === 0 ? 'פגוש קדמי, דלת נהג' : '',
    found_by: 'רכב: סוזוקי · עם נזק',
    actions: 'פינוי הרכב לשול (דוגמה)',
  }
}

const now = Date.now()
const PEOPLE: PersonHit[] = [
  {
    id: 'dev-p-1',
    full_name: 'דני כהן',
    callsign: '214',
    highest_role: 'shift_lead',
    volunteer_status: 'active_volunteer',
    last_active_at: new Date(now - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'dev-p-2',
    full_name: 'דנה דניאלי',
    callsign: '402',
    highest_role: 'responder',
    volunteer_status: 'phone_training',
    last_active_at: null,
  },
]

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const api: SearchApi = {
  async interpretQuery(q) {
    await wait(300)
    return interpretationFor(state, q)
  },
  async runSearch(f, limit) {
    await wait(500)
    if (state === 'loading') return new Promise(() => {})
    if (state === 'error') throw new Error('dev: search failed')
    if (state === 'empty') return { events: [], archive: [], people: [] }
    const many = state === 'cap' || limit > 200
    const events = range(many ? Math.min(limit, 200) : 3).map(event)
    const archive = range(many ? Math.min(limit, 200) : 3).map(archiveRow)
    return {
      events: f.source === 'archive' ? [] : events,
      archive: f.source === 'new' ? [] : archive,
      people: f.entity === 'events' || state === 'cap' ? [] : PEOPLE,
    }
  },
  async reportCounts() {},
  async reportChipRemoved() {},
  async fetchFirstNewEventDate() {
    return '2026-11-01'
  },
}

const mockAuth = {
  session: null,
  user: { id: 'dev-admin' },
  profile: { id: 'dev-admin', full_name: 'מנהל (דמו)', callsign: '000', active: true },
  roles: ['admin'],
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
      <span>מסך פיתוח — עמוד החיפוש האמיתי עם נתונים מדומים:</span>
      {STATES.map((s) => (
        <a key={s} href={`?state=${s}`} aria-current={s === state ? 'page' : undefined}>
          {s}
        </a>
      ))}
    </nav>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={mockAuth}>
      <ToastProvider>
        <div className="shell dev-shell" data-theme="field">
          <main className="shell__main">
            <DevBar />
            <SearchPage
              initialQuery={QUERIES[state]}
              onQueryChange={(q) => console.info('[dev] onQueryChange', q)}
              onOpenEvent={(id) => console.info('[dev] open event', id)}
              onOpenUser={(id) => console.info('[dev] open user', id)}
              api={api}
            />
          </main>
        </div>
      </ToastProvider>
    </AuthContext.Provider>
  </StrictMode>,
)
