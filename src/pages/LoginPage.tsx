import { useState, type FormEvent } from 'react'
import { AlertCircle, KeyRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { monoClass } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { StampChip } from '../components/ui/StampChip'
import { PasswordField, TextField } from '../components/ui/TextField'

type Mode = 'signin' | 'reset' | 'reset-sent' | 'set-password' | 'password-set'

type LoginPageProps = {
  /** Force set-password UI (invite / recovery redirect). */
  forceSetPassword?: boolean
}

const UNIT_LINE = 'היחידה הארצית לפינוי צירים'

export function LoginPage({ forceSetPassword = false }: LoginPageProps) {
  const {
    signIn,
    requestPasswordReset,
    updatePassword,
    acknowledgePasswordSetup,
    passwordSetupReason,
    profile,
    signOut,
  } = useAuth()
  const [mode, setMode] = useState<Mode>(forceSetPassword ? 'set-password' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  async function onSetPassword(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('הסיסמה קצרה מדי. בחרו סיסמה באורך 6 תווים לפחות.')
      return
    }
    if (password !== confirmPassword) {
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
    passwordSetupReason === 'recovery' ? 'איפוס סיסמה' : 'בחירת סיסמה'
  const setPasswordBody =
    passwordSetupReason === 'recovery'
      ? 'בחרו סיסמה חדשה להמשך הכניסה למערכת.'
      : 'הזמנתכם אושרה. בחרו סיסמה אישית כדי להשלים את ההרשמה ולהיכנס למערכת.'
  const setupEyebrow =
    passwordSetupReason === 'recovery' ? 'איפוס גישה' : 'השלמת הרשמה'

  return (
    <div className={['login', isSetupFlow ? 'login--setup' : ''].filter(Boolean).join(' ')}>
      <section className="login__hero" data-theme="command">
        <h1 className="t-display">יחפ״צ</h1>
        <p className="t-body text-secondary">{UNIT_LINE}</p>
        <span className="login__rule" aria-hidden="true" />
      </section>

      <section className="login__panel" data-theme="field">
        <div className={['login__card', isSetupFlow ? 'login__card--setup' : '', 'stack-4'].join(' ')}>
          {mode === 'signin' ? (
            <form className="stack-4" onSubmit={onSignIn} noValidate>
              <h2 className="t-section">כניסה למערכת</h2>

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

              {error ? (
                <p className="alert alert--error" role="alert">
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <Button type="submit" block loading={busy} loadingLabel="נכנס…">
                כניסה
              </Button>

              <Button variant="ghost" block onClick={() => goTo('reset')}>
                שכחתי סיסמה
              </Button>
            </form>
          ) : null}

          {mode === 'reset' ? (
            <form className="stack-4" onSubmit={onReset} noValidate>
              <h2 className="t-section">איפוס סיסמה</h2>
              <p className="t-body text-secondary">
                הזינו את כתובת הדוא״ל שלכם ונשלח אליה קישור לאיפוס הסיסמה.
              </p>

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

              {error ? (
                <p className="alert alert--error" role="alert">
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <Button type="submit" block loading={busy} loadingLabel="שולח…">
                שליחת קישור לאיפוס
              </Button>

              <Button variant="ghost" block onClick={() => goTo('signin')}>
                חזרה לכניסה
              </Button>
            </form>
          ) : null}

          {mode === 'reset-sent' ? (
            <div className="stack-4">
              <h2 className="t-section">איפוס סיסמה</h2>
              <p className="t-body">קישור לאיפוס סיסמה נשלח אל הכתובת שהזנתם.</p>
              <Button variant="ghost" block onClick={() => goTo('signin')}>
                חזרה לכניסה
              </Button>
            </div>
          ) : null}

          {mode === 'set-password' ? (
            <form className="stack-6" onSubmit={onSetPassword} noValidate>
              <SetupWelcome
                eyebrow={setupEyebrow}
                name={displayName}
                callsign={callsign}
              />

              <div className="login-setup__intro stack-2">
                <div className="login-setup__title-row">
                  <span className="login-setup__icon" aria-hidden="true">
                    <KeyRound size={22} strokeWidth={1.75} />
                  </span>
                  <h2 className="t-section">{setPasswordTitle}</h2>
                </div>
                <p className="t-body text-secondary">{setPasswordBody}</p>
              </div>

              <div className="stack-4">
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

              {error ? (
                <p className="alert alert--error" role="alert">
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <div className="stack-3">
                <Button type="submit" block loading={busy} loadingLabel="שומר…">
                  שמירת סיסמה
                </Button>

                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    void signOut()
                  }}
                >
                  יציאה
                </Button>
              </div>
            </form>
          ) : null}

          {mode === 'password-set' ? (
            <div className="stack-6">
              <SetupWelcome
                eyebrow="ההרשמה הושלמה"
                name={displayName}
                callsign={callsign}
              />

              <div className="login-setup__success stack-3">
                <StampChip label="נשמר" tone="done" />
                <h2 className="t-section">הסיסמה נשמרה</h2>
                <p className="t-body" role="status">
                  {passwordSetupReason === 'recovery'
                    ? 'הסיסמה עודכנה בהצלחה. אפשר להמשיך למערכת.'
                    : 'ברוכים הבאים ליחפ״צ. ההרשמה הושלמה — אפשר להמשיך למערכת.'}
                </p>
              </div>

              <Button
                block
                onClick={() => {
                  acknowledgePasswordSetup()
                }}
              >
                המשך למערכת
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
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
