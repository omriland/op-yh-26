import { useEffect, useState } from 'react'
import { ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  completeResponderFill,
  computeOdometerEnd,
  fetchResponderFillContext,
  odometerEndAutoHint,
  odometerRangeError,
  saveResponderFillDraft,
  type ResponderFillContext,
  type ResponderFillDraft,
  type ResponderFillErrors,
} from '../lib/responderFill'
import { participationStamp } from '../lib/status'
import {
  digitsOnly,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPlate,
} from '../lib/format'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { FormStickyFooter } from '../components/ui/FormStickyFooter'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { SelectField } from '../components/ui/SelectField'
import { StampChip } from '../components/ui/StampChip'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'

type ResponderFillPageProps = {
  eventId: string
  onBack: () => void
  onCompleted: () => void
}

export function ResponderFillPage({ eventId, onBack, onCompleted }: ResponderFillPageProps) {
  const { user } = useAuth()
  const { show } = useToast()
  const [ctx, setCtx] = useState<ResponderFillContext | null>(null)
  const [draft, setDraft] = useState<ResponderFillDraft | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [errors, setErrors] = useState<ResponderFillErrors>({})
  const [savingDraft, setSavingDraft] = useState(false)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    if (!user) {
      setLoadState('denied')
      return
    }
    let active = true
    setLoadState('loading')

    fetchResponderFillContext(eventId, user.id)
      .then((next) => {
        if (!active) return
        if (!next) {
          setLoadState('denied')
          return
        }
        setCtx(next)
        setDraft(next.draft)
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('denied')
      })

    return () => {
      active = false
    }
  }, [eventId, user])

  const readOnly =
    ctx?.participationStatus === 'done' || ctx?.eventStatus === 'done'
  const eventClosedWhileOpen =
    ctx?.eventStatus === 'done' && ctx.participationStatus !== 'done'

  function patchDraft(patch: Partial<ResponderFillDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function patchOdometerStart(value: string) {
    if (!draft || !ctx) return
    const odometer_end = computeOdometerEnd(value, ctx.totalKm)
    patchDraft({ odometer_start: value, odometer_end })
    const rangeError = odometerRangeError(value, odometer_end)
    setErrors((current) => ({
      ...current,
      odometer_start: undefined,
      odometer_end: rangeError,
    }))
  }

  async function onSaveDraft() {
    if (!ctx || !draft || readOnly) return
    setSavingDraft(true)
    setErrors({})
    const result = await saveResponderFillDraft({
      assignmentId: ctx.assignmentId,
      eventId: ctx.eventId,
      draft,
      allowedPlates: ctx.vehicles.map((vehicle) => vehicle.plate),
      totalKm: ctx.totalKm,
    })
    setSavingDraft(false)
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors)
      show(result.error, 'alert')
      return
    }
    setCtx((current) =>
      current
        ? {
            ...current,
            participationStatus: 'in_progress',
            eventStatus: result.eventStatus ?? current.eventStatus,
          }
        : current,
    )
    show('הטיוטה נשמרה', 'done')
  }

  async function onComplete() {
    if (!ctx || !draft || readOnly) return
    setCompleting(true)
    setErrors({})
    const result = await completeResponderFill({
      assignmentId: ctx.assignmentId,
      eventId: ctx.eventId,
      draft,
      allowedPlates: ctx.vehicles.map((vehicle) => vehicle.plate),
      totalKm: ctx.totalKm,
    })
    setCompleting(false)
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors)
      show(result.error, 'alert')
      const first = document.querySelector('[aria-invalid="true"]')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    show('הדיווח הושלם', 'done')
    onCompleted()
  }

  useDesktopFormSubmit(() => void onComplete(), {
    enabled:
      loadState === 'ready' &&
      Boolean(draft) &&
      !readOnly &&
      !completing &&
      !savingDraft,
  })

  if (loadState === 'denied') {
    return (
      <EmptyState
        icon={<FileWarning size={40} strokeWidth={1.75} />}
        title="אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים."
        action={
          <Button variant="secondary" onClick={onBack}>
            חזרה
          </Button>
        }
      />
    )
  }

  if (loadState === 'loading' || !ctx || !draft) {
    return <EventListSkeleton count={2} />
  }

  const stamp = participationStamp(ctx.participationStatus, true)

  return (
    <div className="responder-fill">
      <div className="event-form__panel" data-theme="field">
        <div className="event-form__head">
          <button type="button" className="event-form__back" onClick={onBack}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            חזרה
          </button>
          <div className="event-form__title-row">
            <div className="event-form__title-block">
              <h1 className="t-title">השלמת הפרטים שלי</h1>
              {readOnly ? (
                <p className="t-caption text-muted">
                  {ctx.updated_at
                    ? `הדיווח הושלם ב־${formatDateTime(ctx.updated_at)}. `
                    : 'הדיווח הושלם. '}
                  רק אחמ״ש יכול לערוך לאחר סיום.
                </p>
              ) : null}
            </div>
            <StampChip {...stamp} />
          </div>
        </div>

        {eventClosedWhileOpen ? (
          <p className="banner banner--info t-body" role="status">
            האירוע נסגר. לא ניתן לערוך את הדיווח.
          </p>
        ) : null}

        <section className="card responder-fill__context">
          <Ledger>
            <LedgerRow label="תאריך" value={formatDate(ctx.event_date)} numeric />
            <LedgerRow
              label="מספר אירוע"
              value={ctx.police_event_id ?? undefined}
              numeric
            />
            <LedgerRow label="סוג אירוע" value={ctx.event_type_name ?? undefined} />
            {ctx.is_cancelled ? <LedgerRow label="בוטל" value="כן" /> : null}
            <LedgerRow label="כביש" value={ctx.road_name ?? undefined} />
            <LedgerRow label="מיקום" value={ctx.location ?? undefined} />
            <LedgerRow label="אחמ״ש" value={ctx.shift_lead_name ?? undefined} />
            <LedgerRow
              label="קילומטרים (אחמ״ש)"
              value={
                ctx.totalKm != null ? `${formatNumber(ctx.totalKm)} ק״מ` : 'טרם הוזנו'
              }
              numeric={ctx.totalKm != null}
            />
          </Ledger>
        </section>

        <section className="form-section responder-fill__section">
          <h2 className="form-section__heading">הפרטים שלי</h2>
          <div className="form-section__fields">
            {readOnly ? (
              <>
                <Ledger>
                  <LedgerRow
                    label="לוחית רישוי"
                    value={draft.vehicle_plate ? formatPlate(draft.vehicle_plate) : undefined}
                    numeric
                    isolate
                  />
                  <LedgerRow
                    label='מד אוץ התחלה'
                    value={
                      draft.odometer_start
                        ? formatNumber(Number(draft.odometer_start))
                        : undefined
                    }
                    numeric
                  />
                  <LedgerRow
                    label='מד אוץ סיום'
                    value={
                      draft.odometer_end
                        ? formatNumber(Number(draft.odometer_end))
                        : undefined
                    }
                    numeric
                  />
                  <LedgerRow label="נתיב נסיעה" value={draft.route || undefined} />
                  <LedgerRow
                    label="פירוט הטיפול"
                    value={draft.treatment_detail || undefined}
                  />
                  <LedgerRow
                    label="הערות לטיפול"
                    value={draft.treatment_notes || undefined}
                  />
                </Ledger>
                <p className="t-caption text-muted">{odometerEndAutoHint(ctx.totalKm)}</p>
              </>
            ) : (
              <>
                <SelectField
                  label="לוחית רישוי"
                  required
                  placeholder="בחירת רכב"
                  value={draft.vehicle_plate}
                  disabled={ctx.vehicles.length === 0}
                  hint={
                    ctx.vehicles.length === 0
                      ? 'לא מקושר רכב למשתמש. פנו למנהל המערכת.'
                      : undefined
                  }
                  error={errors.vehicle_plate}
                  options={ctx.vehicles.map((vehicle) => ({
                    value: vehicle.plate,
                    label: vehicle.model
                      ? `${formatPlate(vehicle.plate)} · ${vehicle.model}`
                      : formatPlate(vehicle.plate),
                  }))}
                  onChange={(event) => {
                    patchDraft({ vehicle_plate: event.target.value })
                    setErrors((current) => ({ ...current, vehicle_plate: undefined }))
                  }}
                />
                <TextField
                  label='מד אוץ התחלה'
                  required
                  numeric
                  inputMode="numeric"
                  value={draft.odometer_start}
                  error={errors.odometer_start}
                  onChange={(event) =>
                    patchOdometerStart(digitsOnly(event.target.value))
                  }
                />
                <TextField
                  label='מד אוץ סיום'
                  required
                  numeric
                  inputMode="numeric"
                  readOnly
                  value={draft.odometer_end}
                  placeholder="יחושב אוטומטית"
                  error={errors.odometer_end}
                  hint={odometerEndAutoHint(ctx.totalKm)}
                />
                <TextField
                  label="נתיב נסיעה"
                  required
                  value={draft.route}
                  error={errors.route}
                  placeholder="דרך צומת X וכביש Y וכו'"
                  onChange={(event) => {
                    patchDraft({ route: event.target.value })
                    setErrors((current) => ({ ...current, route: undefined }))
                  }}
                />
                <TextAreaField
                  label="פירוט הטיפול"
                  required
                  value={draft.treatment_detail}
                  error={errors.treatment_detail}
                  style={{ minHeight: 120 }}
                  onChange={(event) => {
                    patchDraft({ treatment_detail: event.target.value })
                    setErrors((current) => ({ ...current, treatment_detail: undefined }))
                  }}
                />
                <TextAreaField
                  label="הערות לטיפול"
                  value={draft.treatment_notes}
                  onChange={(event) => patchDraft({ treatment_notes: event.target.value })}
                />
              </>
            )}
          </div>
        </section>

        {readOnly ? null : (
          <FormStickyFooter>
            <div className="event-form__footer-actions">
              <Button loading={completing} loadingLabel="שומר…" onClick={() => void onComplete()}>
                סיום דיווח
              </Button>
              <Button
                variant="secondary"
                loading={savingDraft}
                loadingLabel="שומר…"
                disabled={completing}
                onClick={() => void onSaveDraft()}
              >
                שמירת טיוטה
              </Button>
            </div>
          </FormStickyFooter>
        )}
      </div>
    </div>
  )
}
