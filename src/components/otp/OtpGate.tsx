import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { otpGateLede } from '../../lib/otpGateCopy'
import { startOtp, verifyOtp, type OtpPurpose } from '../../lib/phoneOtp'

const RESEND_COOLDOWN_SEC = 60

/** Survives React Strict Mode remount so we do not fire two auto-starts. */
const autoStartAt = new Map<string, number>()
const AUTO_START_DEDUP_MS = 8_000

type OtpGateProps = {
  purpose: OtpPurpose
  maskedPhone: string | null
  onVerified: () => void
  /** Optional escape (e.g. leave users page). */
  onCancel?: () => void
  cancelLabel?: string
}

export function OtpGate({
  purpose,
  maskedPhone,
  onVerified,
  onCancel,
  cancelLabel = 'ביטול',
}: OtpGateProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [sentOnce, setSentOnce] = useState(false)
  const sendingRef = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  useEffect(() => {
    const prev = autoStartAt.get(purpose) ?? 0
    if (Date.now() - prev < AUTO_START_DEDUP_MS) {
      setSentOnce(true)
      setCooldown(RESEND_COOLDOWN_SEC)
      return
    }
    autoStartAt.set(purpose, Date.now())
    void sendCode()
    // Auto-send once on mount for this purpose/phone.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount send
  }, [])

  async function sendCode() {
    if (sendingRef.current || cooldown > 0) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    const result = await startOtp(purpose)
    sendingRef.current = false
    setSending(false)
    if (!result.ok) {
      autoStartAt.delete(purpose)
      setError(result.error)
      return
    }
    setSentOnce(true)
    setCooldown(RESEND_COOLDOWN_SEC)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const digits = code.replace(/\D/g, '')
    if (digits.length < 4) {
      setError('הקוד שגוי או שפג תוקפו.')
      return
    }
    setVerifying(true)
    const result = await verifyOtp(purpose, digits)
    setVerifying(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    autoStartAt.delete(purpose)
    onVerified()
  }

  const lede = otpGateLede({ purpose, maskedPhone, sentOnce })

  return (
    <div className="login login--setup" data-theme="command">
      <div className="login__stage">
        <div className="login__card login__card--setup" data-theme="field">
          <form className="login__form" onSubmit={(e) => void onSubmit(e)} noValidate>
            <header className="login__form-head">
              <h2 className="login__heading">אימות ב-SMS</h2>
              {lede.securityNote ? (
                <p className="login__lede t-body text-secondary">{lede.securityNote}</p>
              ) : null}
              <p className="login__lede t-body text-secondary">
                {lede.maskedPhone && lede.phonePrefix ? (
                  <>
                    {lede.phonePrefix}
                    <bdi dir="ltr">{lede.maskedPhone}</bdi>
                  </>
                ) : (
                  lede.fallbackLine
                )}
              </p>
              <p className="login__lede t-body text-secondary">{lede.deliveryNote}</p>
            </header>

            <div className="login__fields">
              <TextField
                label="קוד אימות"
                inputMode="numeric"
                autoComplete="one-time-code"
                isolate
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              />
            </div>

            {error ? (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="login__actions">
              <Button type="submit" block loading={verifying} loadingLabel="מאמת…">
                אימות
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={sending || cooldown > 0}
                loading={sending}
                loadingLabel="שולח…"
                onClick={() => void sendCode()}
              >
                {cooldown > 0 ? `שלח שוב (${cooldown})` : 'שלח שוב'}
              </Button>
              {onCancel ? (
                <Button type="button" variant="ghost" block onClick={onCancel}>
                  {cancelLabel}
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
