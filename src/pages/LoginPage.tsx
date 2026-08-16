import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, KeyRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { monoClass } from '../lib/format'
import { passwordStrengthError } from '../lib/passwordRules'
import { timingSafeEqual } from '../lib/timingSafeEqual'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { StampChip } from '../components/ui/StampChip'
import { PasswordField, TextField } from '../components/ui/TextField'

type Mode = 'signin' | 'reset' | 'reset-sent' | 'set-password' | 'password-set'

type LoginPageProps = {
  /** Force set-password UI (invite / recovery redirect). */
  forceSetPassword?: boolean
}

const PLATFORM_NAME = 'אבן דרך'
const UNIT_LINE = 'היחידה הארצית לפינוי צירים'

export function LoginPage({ forceSetPassword = false }: LoginPageProps) {
  const {
    signIn,
    requestPasswordReset,
    updatePassword,
    redeemInviteToken,
    acknowledgePasswordSetup,
    passwordSetupReason,
    authBootstrapError,
    session,
    profile,
    signOut,
  } = useAuth()
  const [mode, setMode] = useState<Mode>(forceSetPassword ? 'set-password' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // App may remount props without remounting state (same <LoginPage /> type).
  useEffect(() => {
    if (!forceSetPassword && !passwordSetupReason) return
    setMode((current) => (current === 'password-set' ? current : 'set-password'))
  }, [forceSetPassword, passwordSetupReason])

  const isSetupFlow = mode === 'set-password' || mode === 'password-set'
  const displayName = profile?.full_name?.trim() || null
  const callsign = profile?.callsign?.trim() || null

  async function onSignIn(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await signIn(email.trim(), password)
    setBusy(false)
    if (result.error) setError(result.error)
  }

  async function onReset(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await requestPasswordReset(email.trim())
    setBusy(false)
    if (result.error) setError(result.error)
    else setMode('reset-sent')
  }

  async function onRedeemInvite() {
    setBusy(true)
    setError(null)
    const result = await redeemInviteToken()
    setBusy(false)
    if (result.error) setError(result.error)
  }

  async function onSetPassword(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const strengthError = passwordStrengthError(password)
    if (strengthError) {
      setError(strengthError)
      return
    }
    if (!timingSafeEqual(password, confirmPassword)) {
      setError('הסיסמאות אינן תואמות.')
      return
    }
    setBusy(true)
    const result = await updatePassword(password)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setPassword('')
    setConfirmPassword('')
    setMode('password-set')
  }

  function goTo(next: Mode) {
    setError(null)
    setMode(next)
  }

  const setPasswordTitle =
    passwordSetupReason === 'recovery'
      ? 'איפוס סיסמה'
      : passwordSetupReason === 'admin_reset'
        ? 'בחירת סיסמה חדשה'
        : 'בחירת סיסמה'
  const setPasswordBody =
    passwordSetupReason === 'recovery'
      ? 'בחרו סיסמה חדשה להמשך הכניסה למערכת.'
      : passwordSetupReason === 'admin_reset'
        ? 'מנהל הגדיר עבורכם סיסמה. בחרו סיסמה אישית כדי להמשיך.'
        : 'הזמנתכם אושרה. בחרו סיסמה אישית כדי להשלים את ההרשמה ולהיכנס למערכת.'
  const setupEyebrow =
    passwordSetupReason === 'recovery'
      ? 'איפוס גישה'
      : passwordSetupReason === 'admin_reset'
        ? 'החלפת סיסמה'
        : 'השלמת הרשמה'

  return (
    <div
      className={['login', isSetupFlow ? 'login--setup' : ''].filter(Boolean).join(' ')}
      data-theme="command"
    >
      <div className="login__stage">
        <header className="login__masthead" aria-label={PLATFORM_NAME}>
          <div className="login__lockup">
            <h1 className="login__wordmark">{PLATFORM_NAME}</h1>
            <span className="login__divider" aria-hidden="true" />
            <p className="login__unit">{UNIT_LINE}</p>
          </div>
        </header>

        <div
          className={['login__card', isSetupFlow ? 'login__card--setup' : ''].join(' ')}
          data-theme="field"
        >
          {mode === 'signin' ? (
            <form
              className="login__form"
              onSubmit={onSignIn}
              noValidate
            >
              <FormHeading>כניסה למערכת</FormHeading>

              <div className="login__fields">
                <TextField
                  label="דוא״ל"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  isolate
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <PasswordField
                  label="סיסמה"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <FormError message={error ?? authBootstrapError} />

              <div className="login__actions">
                <Button type="submit" block loading={busy} loadingLabel="נכנס…">
                  כניסה
                </Button>
                <div className="login__links">
                  <Button variant="ghost" onClick={() => goTo('reset')}>
                    שכחתי סיסמה
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          {mode === 'reset' ? (
            <form
              className="login__form"
              onSubmit={onReset}
              noValidate
            >
              <FormHeading>איפוס סיסמה</FormHeading>

              <p className="login__lede t-body text-secondary">
                הזינו את כתובת הדוא״ל שלכם ונשלח אליה קישור לאיפוס הסיסמה.
              </p>

              <div className="login__fields">
                <TextField
                  label="דוא״ל"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  isolate
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <FormError message={error} />

              <div className="login__actions">
                <Button type="submit" block loading={busy} loadingLabel="שולח…">
                  שליחת קישור לאיפוס
                </Button>
                <div className="login__links">
                  <Button variant="ghost" onClick={() => goTo('signin')}>
                    חזרה לכניסה
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          {mode === 'reset-sent' ? (
            <div className="login__form">
              <FormHeading>איפוס סיסמה</FormHeading>

              <p className="alert alert--info" role="status">
                קישור לאיפוס סיסמה נשלח אל הכתובת שהזנתם.
              </p>

              <div className="login__actions">
                <div className="login__links">
                  <Button variant="ghost" onClick={() => goTo('signin')}>
                    חזרה לכניסה
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {mode === 'set-password' ? (
            <form
              className="login__form login__form--setup"
              onSubmit={onSetPassword}
              noValidate
            >
              <SetupWelcome
                eyebrow={setupEyebrow}
                name={displayName}
                callsign={callsign}
              />

              <div className="login-setup__intro">
                <div className="login-setup__title-row">
                  <span className="login-setup__icon" aria-hidden="true">
                    <KeyRound size={22} strokeWidth={1.75} />
                  </span>
                  <h2 className="t-section">{setPasswordTitle}</h2>
                </div>
                <p className="t-body text-secondary">
                  {!session
                    ? passwordSetupReason === 'recovery'
                      ? 'לחצו להמשך כדי לאמת את קישור האיפוס ולבחור סיסמה חדשה.'
                      : 'לחצו להמשך כדי לאמת את ההזמנה ולבחור סיסמה. אפשר ללחוץ שוב גם אם הקישור נפתח קודם — ההרשמה נסגרת רק אחרי בחירת סיסמה.'
                    : setPasswordBody}
                </p>
              </div>

              <FormError message={error ?? authBootstrapError} />

              {!session ? (
                <div className="login__actions">
                  <Button
                    type="button"
                    block
                    loading={busy}
                    loadingLabel="מאמתים…"
                    onClick={() => void onRedeemInvite()}
                  >
                    המשך להגדרת סיסמה
                  </Button>
                  <div className="login__links">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void signOut()
                      }}
                    >
                      יציאה
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="login__fields">
                    <PasswordField
                      label="סיסמה חדשה"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />

                    <PasswordField
                      label="אימות סיסמה"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </div>

                  <div className="login__actions">
                    <Button type="submit" block loading={busy} loadingLabel="שומר…">
                      שמירת סיסמה
                    </Button>
                    <div className="login__links">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          void signOut()
                        }}
                      >
                        יציאה
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </form>
          ) : null}

          {mode === 'password-set' ? (
            <div className="login__form login__form--setup">
              <SetupWelcome
                eyebrow="ההרשמה הושלמה"
                name={displayName}
                callsign={callsign}
              />

              <div className="login-setup__success">
                <StampChip
                  label={
                    passwordSetupReason === 'invite' ? 'משתמש נוצר בהצלחה' : 'נשמר'
                  }
                  tone="done"
                />
                <h2 className="t-section">
                  {passwordSetupReason === 'invite' ? 'ההרשמה הושלמה' : 'הסיסמה נשמרה'}
                </h2>
                <p className="t-body" role="status">
                  {passwordSetupReason === 'invite'
                    ? `ברוכים הבאים ל${PLATFORM_NAME}. ההרשמה הושלמה — אפשר להמשיך למערכת.`
                    : 'הסיסמה עודכנה בהצלחה. אפשר להמשיך למערכת.'}
                </p>
              </div>

              <div className="login__actions">
                <Button
                  block
                  onClick={() => {
                    acknowledgePasswordSetup()
                  }}
                >
                  המשך למערכת
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FormHeading({ children }: { children: ReactNode }) {
  return (
    <header className="login__form-head">
      <h2 className="login__heading">{children}</h2>
    </header>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="alert alert--error" role="alert">
      <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
      {message}
    </p>
  )
}

function SetupWelcome({
  eyebrow,
  name,
  callsign,
}: {
  eyebrow: string
  name: string | null
  callsign: string | null
}) {
  if (!name && !callsign) {
    return (
      <p className="t-label text-secondary login-setup__eyebrow">{eyebrow}</p>
    )
  }

  const greeting =
    name && callsign
      ? `שלום, ${name} - `
      : name
        ? `שלום, ${name}`
        : 'שלום'

  return (
    <div className="login-setup__welcome">
      <p className="t-label text-secondary login-setup__eyebrow">{eyebrow}</p>
      <div className="login-setup__person">
        {name ? <Avatar name={name} size="lg" /> : null}
        <p className="login-setup__hello t-body-strong">
          {greeting}
          {callsign ? (
            <span className={monoClass(callsign)}>{callsign}</span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
