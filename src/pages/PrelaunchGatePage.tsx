import { CalendarClock } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isImpersonating } from '../lib/impersonationStash'
import { PRELAUNCH_BODY_LINES, PRELAUNCH_TITLE } from '../lib/prelaunch'
import { Button } from '../components/ui/Button'
import { ImpersonationBar } from '../components/shell/ImpersonationBar'
import { PLATFORM_NAME, UNIT_LINE_1, UNIT_LINE_2 } from './LoginPage'

/** All a signed-in member sees before launch. The database withholds the rest. */
export function PrelaunchGatePage() {
  const { profile, signOut } = useAuth()
  const who = [profile?.full_name, profile?.callsign].filter(Boolean).join(' · ')
  // A super admin viewing as this member goes back through the bar: signing
  // out here would end the member's own sessions.
  const impersonating = isImpersonating()

  return (
    <div className="login" data-theme="command">
      <ImpersonationBar onRestored={() => {}} />
      <div className="login__portal">
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
            <div className="login__form">
              <div className="login-setup__intro">
                <div className="login-setup__title-row">
                  <span className="login-setup__icon" aria-hidden="true">
                    <CalendarClock size={22} strokeWidth={1.75} />
                  </span>
                  <h2 className="t-section">{PRELAUNCH_TITLE}</h2>
                </div>
                <p className="t-body text-secondary">
                  {PRELAUNCH_BODY_LINES[0]}
                  <br />
                  {PRELAUNCH_BODY_LINES[1]}
                </p>
                {who ? <p className="t-caption text-secondary">{who}</p> : null}
              </div>
              {impersonating ? null : (
                <div className="login__actions">
                  <Button type="button" variant="secondary" block onClick={() => void signOut()}>
                    יציאה
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
