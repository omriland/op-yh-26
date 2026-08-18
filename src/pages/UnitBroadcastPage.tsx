import { useEffect, useMemo, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { FilterChips } from '../components/ui/FilterChips'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { formatDateTime, formatNumber, monoClass } from '../lib/format'
import { isImpersonating } from '../lib/impersonationStash'
import {
  fetchBroadcastCandidates,
  fetchBroadcastLog,
  sendUnitBroadcast,
  type UnitBroadcastLogRow,
} from '../lib/unitBroadcastApi'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'
import {
  BROADCAST_AUDIENCES,
  BROADCAST_BODY_MAX,
  BROADCAST_CHANNELS,
  BROADCAST_SUBJECT_MAX,
  broadcastAudienceLabel,
  broadcastChannelLabel,
  needsBroadcastSubject,
  previewUnitBroadcast,
  unitBroadcastConfirmCopy,
  unitBroadcastResultCopy,
  validateUnitBroadcastDraft,
  type BroadcastAudience,
  type BroadcastCandidate,
  type BroadcastChannel,
} from '../lib/unitBroadcast'

export function UnitBroadcastPage({ embedded = false }: { embedded?: boolean }) {
  const { show } = useToast()
  const viewingAsOther = isImpersonating()
  const [channel, setChannel] = useState<BroadcastChannel>('both')
  const [audience, setAudience] = useState<BroadcastAudience>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; body?: string }>({})
  const [candidates, setCandidates] = useState<BroadcastCandidate[] | null>(null)
  const [log, setLog] = useState<UnitBroadcastLogRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let active = true
    setFailed(false)
    Promise.all([fetchBroadcastCandidates(), fetchBroadcastLog()])
      .then(([nextCandidates, nextLog]) => {
        if (!active) return
        setCandidates(nextCandidates)
        setLog(nextLog)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const preview = useMemo(
    () => previewUnitBroadcast(candidates ?? [], { channel, audience }),
    [candidates, channel, audience],
  )
  const confirmCopy = unitBroadcastConfirmCopy(preview, { channel, audience })
  const showSubject = needsBroadcastSubject(channel)

  function requestSend() {
    if (viewingAsOther) {
      show('לא ניתן לשלוח תפוצה במצב צפייה כמשתמש.', 'alert')
      return
    }
    const errors = validateUnitBroadcastDraft({ channel, subject, body })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (!preview.canSend) {
      show(confirmCopy, 'alert')
      return
    }
    setConfirmOpen(true)
  }

  useDesktopFormSubmit(() => requestSend(), { enabled: !confirmOpen && !sending })

  async function confirmSend() {
    setSending(true)
    const result = await sendUnitBroadcast({
      channel,
      audience,
      subject: showSubject ? subject : '',
      body,
    })
    setSending(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    setConfirmOpen(false)
    setSubject('')
    setBody('')
    setFieldErrors({})
    show(unitBroadcastResultCopy(result.data), 'done')
    setReloadKey((value) => value + 1)
  }

  return (
    <div className="stack-4">
      {embedded ? null : (
        <div className="page-head">
          <div>
            <h1 className="t-title">תפוצה לכלל היחידה</h1>
            <p className="t-caption text-muted">
              שליחת הודעה למנהלים, לאחמ״שים או לכלל המשתמשים הפעילים.
            </p>
          </div>
        </div>
      )}

      {viewingAsOther ? (
        <p className="alert alert--info" role="status">
          צפייה כמשתמש — לא ניתן לשלוח תפוצה.
        </p>
      ) : null}

      <section className="card stack-4">
        <FilterChips
          label="ערוץ שליחה"
          value={channel}
          onChange={setChannel}
          options={BROADCAST_CHANNELS.map((item) => ({ value: item.id, label: item.label }))}
        />
        <FilterChips
          label="קהל יעד"
          value={audience}
          onChange={setAudience}
          options={BROADCAST_AUDIENCES.map((item) => ({ value: item.id, label: item.label }))}
        />
        {showSubject ? (
          <TextField
            label="נושא"
            required
            value={subject}
            maxLength={BROADCAST_SUBJECT_MAX}
            error={fieldErrors.subject}
            onChange={(event) => {
              setSubject(event.target.value)
              if (fieldErrors.subject) setFieldErrors((current) => ({ ...current, subject: undefined }))
            }}
          />
        ) : null}
        <TextAreaField
          label="תוכן ההודעה"
          required
          rows={6}
          value={body}
          maxLength={BROADCAST_BODY_MAX}
          error={fieldErrors.body}
          onChange={(event) => {
            setBody(event.target.value)
            if (fieldErrors.body) setFieldErrors((current) => ({ ...current, body: undefined }))
          }}
        />
        <p className="t-caption text-muted">
          {candidates === null
            ? 'טוען נמענים…'
            : preview.canSend
              ? [
                  `${formatNumber(preview.recipientCount)} נמענים ישלחו.`,
                  skipCaption(preview),
                ]
                  .filter(Boolean)
                  .join(' ')
              : confirmCopy}
        </p>
        <Button
          onClick={requestSend}
          disabled={viewingAsOther || candidates === null}
          loading={sending}
          loadingLabel="שולח…"
        >
          שליחה
        </Button>
      </section>

      <section className="stack-3">
        <h2 className="t-section">שידורים קודמים</h2>
        {log === null && !failed ? <EventListSkeleton count={3} /> : null}
        {failed ? (
          <EmptyState
            icon={<Megaphone size={40} strokeWidth={1.75} />}
            title="טעינת התפוצה נכשלה"
            caption="בדקו את החיבור ונסו שוב."
            action={
              <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
                רענון
              </Button>
            }
          />
        ) : null}
        {log && log.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={40} strokeWidth={1.75} />}
            title="עדיין לא נשלחה תפוצה."
          />
        ) : null}
        {log && log.length > 0 ? (
          <ul className="list-rows">
            {log.map((row) => (
              <li key={row.id} className="list-rows__item list-rows__item--stack">
                <div className="list-rows__label">
                  <span className="t-body-strong">
                    {formatDateTime(row.createdAt)} · {row.senderName}{' '}
                    <span className={monoClass(row.senderCallsign)}>או״ק {row.senderCallsign}</span>
                  </span>
                  <span className="t-caption text-muted">
                    {broadcastChannelLabel(row.channel)} · {broadcastAudienceLabel(row.audience)} ·
                    נשלח ל־{formatNumber(row.recipientCount)}
                    {row.pushCount > 0 ? ` · ${formatNumber(row.pushCount)} התראות` : ''}
                    {row.pushFailedCount > 0
                      ? ` · ${formatNumber(row.pushFailedCount)} התראות נכשלו`
                      : ''}
                  </span>
                  {row.subject ? <span className="t-body">{row.subject}</span> : null}
                  <span className="t-caption">{row.body}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <Dialog
        open={confirmOpen}
        title="אישור שליחה"
        onClose={() => !sending && setConfirmOpen(false)}
        footer={
          <>
            <Button
              loading={sending}
              loadingLabel="שולח…"
              onClick={() => void confirmSend()}
            >
              שליחה
            </Button>
            <Button variant="secondary" disabled={sending} onClick={() => setConfirmOpen(false)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">{confirmCopy}</p>
      </Dialog>
    </div>
  )
}

function skipCaption(preview: {
  skippedNoPhone: number
  skippedNoEmail: number
  pushCount: number
}): string {
  const parts: string[] = []
  if (preview.pushCount > 0) {
    parts.push(`${formatNumber(preview.pushCount)} עם האפליקציה`)
  }
  if (preview.skippedNoPhone > 0) {
    parts.push(`${formatNumber(preview.skippedNoPhone)} בלי טלפון ידולגו`)
  }
  if (preview.skippedNoEmail > 0) {
    parts.push(`${formatNumber(preview.skippedNoEmail)} בלי דוא״ל ידולגו`)
  }
  return parts.length > 0 ? parts.join('. ') : ''
}
