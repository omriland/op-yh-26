// DEV-ONLY harness: the REAL AppShell, top bar SearchCombobox and SearchPage, with a
// mocked auth context per role and the stubbed data boundary in searchDevApi (invented
// sample data). Not part of the app bundle.
//   /search-dev.html?role=admin|shift_lead|responder&view=home|search&q=<query>&slow=1

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AppRole, type AuthState } from '../lib/auth'
import { statusAudienceForRoles } from '../lib/eventLifecycle'
import { __setLegacyFixtureProvider, type LegacyReport } from '../lib/reports/legacyReport'
import fixture from '../lib/reports/__fixtures__/legacyReports.sample.json'
import { handOffPrepared } from '../lib/search/prepareQuery'
import { searchRoleFor } from '../lib/search/searchRole'
import { useIsDesktop } from '../lib/useMediaQuery'
import { AppShell, type AppView } from '../components/shell/AppShell'
import { buildNavEntries } from '../components/shell/navEntries'
import { SearchCombobox, type SearchPageLink } from '../components/search/SearchCombobox'
import { ToastProvider } from '../components/ui/Toast'
import { SearchPage } from '../pages/SearchPage'
import { DEV_SENTENCES, DEV_VIEWER_ID, devSearchApi } from './searchDevApi'
import '../index.css'

__setLegacyFixtureProvider(async () => fixture as unknown as LegacyReport[])

const ROLE_SETS: Record<string, AppRole[]> = {
  admin: ['admin', 'responder'],
  shift_lead: ['shift_lead', 'responder'],
  responder: ['responder'],
}

const params = new URLSearchParams(window.location.search)
const roleKey = params.get('role') ?? 'admin'
const roles = ROLE_SETS[roleKey] ?? ROLE_SETS.admin
const role = searchRoleFor(roles)
const audience = statusAudienceForRoles(roles)
const api = devSearchApi(role, { slow: params.get('slow') === '1' })

const mockAuth = {
  session: null,
  user: { id: DEV_VIEWER_ID },
  profile: { id: DEV_VIEWER_ID, full_name: 'משתמש לדוגמה', callsign: '214', active: true, availability: 'available', available_from: null },
  roles,
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

function DevApp() {
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<AppView>(params.get('view') === 'search' ? 'search' : 'mine')
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [bar, setBar] = useState(params.get('q') ?? '')
  const [note, setNote] = useState('')
  const [reportFk, setReportFk] = useState<string | null>(null)
  const manages = role !== 'responder'
  const entries = buildNavEntries({
    manages,
    hasMineList: true,
    isAdmin: role === 'admin',
    isSuperAdmin: false,
    showSuperAdminNav: false,
    isDesktop,
    navAttention: { mineEvents: false, myShifts: false, openFeedback: false },
    roles,
  })
  const pages: SearchPageLink[] = entries
    .flatMap((e) => [e, ...(e.children ?? [])])
    .filter((e): e is typeof e & { view: AppView } => Boolean(e.view) && e.view !== 'search')
    .map((e) => ({ view: e.view, label: e.label }))
  const shortcuts: SearchPageLink[] =
    role === 'responder'
      ? [
          { view: 'mine', label: 'האירועים שלי' },
          { view: 'my_shifts', label: 'המשמרות שלי' },
        ]
      : [
          { view: 'events', label: 'אירועי היחידה' },
          { view: 'shifts', label: 'משמרות' },
          ...(role === 'admin' ? [{ view: 'users', label: 'משתמשים' }] : []),
        ]
  const common = {
    role,
    audience,
    onOpenEvent: (id: string) => setNote(`אירוע ${id}`),
    onOpenPerson: (p: { full_name: string }) => setNote(`אדם: ${p.full_name}`),
    onNavigate: (v: string) => {
      setNote('')
      setView(v as AppView)
    },
    pages,
    shortcuts,
    canOpenReports: manages,
    api,
  }
  const run = (q: string) => {
    setQuery(q)
    setBar(q)
    setReportFk(null)
    setView('search')
  }

  return (
    <AppShell
      withSidebar={isDesktop}
      narrow={false}
      view={view}
      onNavigate={(next) => {
        setNote('')
        setView(next)
      }}
      onHome={() => setView('mine')}
      entries={entries}
      onCreateEvent={manages ? () => setNote('אירוע חדש') : undefined}
      onOpenSupport={() => setNote('תמיכה')}
      onOpenPrivacy={() => setNote('מדיניות פרטיות')}
      onOpenAndroid={() => setNote('הורדת אנדרואיד')}
      search={
        <SearchCombobox
          variant="bar"
          {...common}
          query={bar}
          onQueryChange={setBar}
          onSubmit={(q, prepared) => {
            if (prepared) handOffPrepared(prepared)
            run(q)
          }}
          onOpenArchive={(fk, q) => {
            run(q)
            setReportFk(fk)
          }}
          placeholder="חיפוש אירועים, אנשים ועמודים"
        />
      }
    >
      {view === 'search' ? (
        <SearchPage {...common} initialQuery={query} onQueryChange={run} initialReportFk={reportFk} />
      ) : (
        <div className="stack-4">
          <h1 className="t-title">{role === 'responder' ? 'האירועים שלי' : 'אירועי היחידה'}</h1>
          <p className="t-body text-muted">
            [DEV] נתונים לדוגמה. משפטים לבדיקה: ״{DEV_SENTENCES.person}״ · ״{DEV_SENTENCES.shifts}״ · ״
            {DEV_SENTENCES.none}״ · ״{DEV_SENTENCES.fail}״
          </p>
          {note ? <p className="t-body">[DEV] נפתח: {note}</p> : null}
        </div>
      )}
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={mockAuth}>
      <ToastProvider>
        <DevApp />
      </ToastProvider>
    </AuthContext.Provider>
  </StrictMode>,
)
