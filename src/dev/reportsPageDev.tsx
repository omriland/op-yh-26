// DEV-ONLY harness: renders the REAL ReportsPage (the site's Reports section) with a
// mocked admin auth context, so we can see the new "ארכיון דוחות אירוע" card in place
// and open the archive — without logging into production. Served at
// /reports-section-dev.html. Not part of the app bundle.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext, type AuthState } from '../lib/auth'
import { ToastProvider } from '../components/ui/Toast'
import { ReportsPage } from '../pages/ReportsPage'
import { __setLegacyFixtureProvider, type LegacyReport } from '../lib/reports/legacyReport'
import fixture from '../lib/reports/__fixtures__/legacyReports.sample.json'
import '../index.css'

// Dev-only: feed the local sample dataset into the legacy-archive data layer.
__setLegacyFixtureProvider(async () => fixture as unknown as LegacyReport[])

// Minimal admin context — enough for the Reports landing + the legacy archive view.
// Other (tabular) report cards would try to query Supabase when opened; that's fine
// for this demo, we only exercise the legacy card.
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={mockAuth}>
      <ToastProvider>
        <div className="shell" data-theme="field">
          <main className="shell__main" style={{ maxWidth: 1040, margin: '0 auto', padding: 24 }}>
            <div
              style={{
                background: '#fffae6',
                border: '1px solid #e6d98a',
                padding: '8px 12px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                direction: 'rtl',
              }}
            >
              ⚙️ מסך פיתוח — עמוד "דוחות" האמיתי עם הרשאת מנהל מדומה. לחץ על "ארכיון דוחות אירוע".
            </div>
            <ReportsPage asTable={false} onOpenEvent={() => {}} />
          </main>
        </div>
      </ToastProvider>
    </AuthContext.Provider>
  </StrictMode>,
)
