import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { isImpersonating } from '../lib/impersonationStash'
import {
  type OAuthAuthorizeRequest,
} from '../lib/partnerOAuth'
import { approvePartnerAuthorize, fetchPartnerClientInfo } from '../lib/partnerApi'
import { Button } from '../components/ui/Button'

const PLATFORM_NAME = 'אבן דרך'
const UNIT_LINE_1 = 'היחידה הארצית'
const UNIT_LINE_2 = 'לפינוי צירים'

type OAuthAuthorizePageProps = {
  request: OAuthAuthorizeRequest | null
  error?: string
}

export function OAuthAuthorizePage({ request, error: bootError }: OAuthAuthorizePageProps) {
  const [appName, setAppName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(bootError ?? null)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  const impersonating = isImpersonating()

  useEffect(() => {
    if (!request) return
    let active = true
    fetchPartnerClientInfo(request.clientId).then((result) => {
      if (!active) return
      if (result.ok) setAppName(result.info.name)
      else setError(result.error)
    })
    return () => {
      active = false
    }
  }, [request])

  async function onApprove() {
    if (impersonating || !request) return
    setBusy(true)
    setError(null)
    const result = await approvePartnerAuthorize({
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      state: request.state,
    })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    window.location.assign(result.redirect)
  }

  return (
    <div className="login" data-theme="command">
      <div className="login__stage">
        <header className="login__masthead" aria-label={PLATFORM_NAME}>
          <div className="login__lockup">
            <h1 className="login__wordmark">{PLATFORM_NAME}</h1>
            <span className="login__divider" aria-hidden="true" />
            <p className="login__unit">
              <span className="login__unit-line">{UNIT_LINE_1}</span>
              <span className="login__unit-line">{UNIT_LINE_2}</span>
            </p>
          </div>
        </header>

        <div className="login__card" data-theme="field">
          {denied ? (
            <div className="login__form">
              <header className="login__form-head">
                <h2 className="login__heading">הגישה לא אושרה</h2>
              </header>
              <p className="login__lede t-body text-secondary">
                לא חיברנו את היישום לחשבון. אפשר לסגור את החלון ולחזור לטלגרם.
              </p>
            </div>
          ) : (
            <div className="login__form">
              <header className="login__form-head">
                <h2 className="login__heading">אישור גישה</h2>
              </header>
              <p className="login__lede t-body text-secondary">
                {!request
                  ? (bootError ?? 'קישור האישור אינו תקין.')
                  : appName ? (
                    <>
                      היישום <strong>{appName}</strong> מבקש גישה להשלמת דיווחי האירועים שלך
                      (קילומטרים, טיפול, לוחיות ומדיה) למשך 7 ימים.
                    </>
                  ) : (
                    'טוען פרטי יישום…'
                  )}
              </p>
              {impersonating ? (
                <p className="alert alert--error" role="alert">
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  לא ניתן לאשר יישום בזמן התחזות.
                </p>
              ) : null}
              {error ? (
                <p className="alert alert--error" role="alert">
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              <div className="login__actions">
                <Button
                  type="button"
                  block
                  disabled={!request || !appName || impersonating}
                  loading={busy}
                  loadingLabel="מאשר…"
                  onClick={() => void onApprove()}
                >
                  אשר גישה
                </Button>
                <div className="login__links">
                  <Button variant="ghost" disabled={busy} onClick={() => setDenied(true)}>
                    לא עכשיו
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
