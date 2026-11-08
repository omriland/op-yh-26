// DEV-ONLY harness: renders the REAL AppShell (desktop shell ≥1025px, phone shell below)
// with a mocked auth context and the real role rules from buildNavEntries, so the
// navigation can be checked without logging in. Not part of the app bundle.
// Served at /app-shell-dev.html?role=super_admin|admin|shift_lead|responder&view=<AppView>

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AppRole, type AuthState } from '../lib/auth'
import { ToastProvider } from '../components/ui/Toast'
import { AppShell, type AppView } from '../components/shell/AppShell'
import { buildNavEntries } from '../components/shell/navEntries'
import { useIsDesktop } from '../lib/useMediaQuery'
import { statusAudienceForRoles } from '../lib/eventLifecycle'
import { searchRoleFor } from '../lib/search/searchRole'
import { SearchCombobox } from '../components/search/SearchCombobox'
import { devSearchApi } from './searchDevApi'
import '../index.css'

const ROLE_SETS: Record<string, AppRole[]> = {
  super_admin: ['super_admin', 'admin', 'shift_lead', 'responder'],
  admin: ['admin', 'responder'],
  shift_lead: ['shift_lead', 'responder'],
  responder: ['responder'],
}

const params = new URLSearchParams(window.location.search)
const roleKey = params.get('role') ?? 'super_admin'
const roles = ROLE_SETS[roleKey] ?? ROLE_SETS.super_admin

const mockAuth = {
  session: null,
  user: { id: 'dev-user' },
  profile: {
    id: 'dev-user',
    full_name: 'משתמש לדוגמה',
    callsign: '214',
    active: true,
    availability: 'available',
    available_from: null,
  },
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
  const [view, setView] = useState<AppView>((params.get('view') as AppView) ?? 'mine')
  const [note, setNote] = useState('')
  const [barQuery, setBarQuery] = useState('')
  const isAdmin = roles.includes('admin')
  const isSuperAdmin = roles.includes('super_admin')
  const manages = isAdmin || roles.includes('shift_lead') || isSuperAdmin
  const entries = buildNavEntries({
    manages,
    hasMineList: roles.includes('responder') || roles.includes('shift_lead'),
    isAdmin,
    isSuperAdmin,
    showSuperAdminNav: isSuperAdmin,
    isDesktop,
    navAttention: { mineEvents: true, myShifts: false, openFeedback: isSuperAdmin },
    roles,
  })

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
          role={searchRoleFor(roles)}
          audience={statusAudienceForRoles(roles)}
          query={barQuery}
          onQueryChange={setBarQuery}
          onSubmit={(q) => {
            setView('search')
            setNote(`חיפוש: ${q}`)
          }}
          onOpenEvent={(id) => setNote(`אירוע ${id}`)}
          onOpenPerson={(p) => setNote(`אדם: ${p.full_name}`)}
          onOpenArchive={(fk) => setNote(`דוח ${fk}`)}
          onNavigate={(v) => setView(v as AppView)}
          pages={[]}
          shortcuts={[]}
          canOpenReports={manages}
          api={devSearchApi(searchRoleFor(roles))}
        />
      }
    >
      <div className="stack-4">
        <h1 className="t-title">{entries.flatMap((e) => [e, ...(e.children ?? [])]).find((e) => e.view === view)?.label ?? view}</h1>
        <p className="t-body text-muted">[DEV] תוכן הדף מוחלף כאן. התפקיד: {roleKey}.</p>
        {note ? <p className="t-body">[DEV] נפתח: {note}</p> : null}
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i} className="t-body">
            [DEV] שורת תוכן {i + 1} לבדיקת הגלילה בתוך כרטיס הדף.
          </p>
        ))}
      </div>
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
