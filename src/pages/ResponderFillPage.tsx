import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  completeResponderFill,
  fetchResponderFillContext,
  odometerRangeError,
  saveResponderFillDraft,
  type ResponderFillContext,
  type ResponderFillDraft,
  type ResponderFillErrors,
} from '../lib/responderFill'
import { loadFillByToken, saveFillByToken } from '../lib/responderFillToken'
import { leadKmPendingNote, participationStamp } from '../lib/status'
import { StampWithNote } from '../components/ui/StampWithNote'
import {
  digitsOnly,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPlate,
  plateDigits,
} from '../lib/format'
import { lookupPlate } from '../lib/plateLookup'
import {
  applyTreatedPlateLookup,
  commitTreatedPlate,
  failTreatedPlateLookup,
  removeTreatedPlate,
  setTreatedPlateLeftWhere,
  settleTreatedPlatePending,
} from '../lib/treatedPlates'
import { TreatedPlatesField } from '../components/events/TreatedPlatesField'
import { TreatedPlateStack } from '../components/events/TreatedPlateStack'
import { EventMediaGallery } from '../components/events/EventMediaGallery'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { FormStickyFooter } from '../components/ui/FormStickyFooter'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { SelectField } from '../components/ui/SelectField'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { captureEvent } from '../lib/posthog'
import { useToast } from '../components/ui/Toast'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'
import { useRevealFirstError } from '../lib/revealFirstError'
import {
  clearFillDraft,
  decideFillBack,
  fillDraftSavedLabel,
  readFillDraft,
  stashFillDraft,
} from '../lib/fillDraftStash'
import { shouldKeepLiveFormBoot } from '../lib/formDraftSurvival'

const FILL_STASH_SCOPE = 'responder'
/** Long enough to not thrash on every keystroke, short enough to survive a kill. */
const FILL_STASH_DEBOUNCE_MS = 600
/** --duration-base is 180ms; hold long enough for the press to read, then leave. */
const STAMP_PRESS_HOLD_MS = 700

type ResponderFillPageProps = {
  eventId: string
  /** Opaque fill link token — when set, load/save via Edge (no Auth session required). */
  fillToken?: string
  onBack: () => void
  onCompleted: () => void
}

export function ResponderFillPage({
  eventId,
  fillToken,
  onBack,
  onCompleted,
}: ResponderFillPageProps) {
  const { user } = useAuth()
  const { show } = useToast()
  const [ctx, setCtx] = useState<ResponderFillContext | null>(null)
  const [draft, setDraft] = useState<ResponderFillDraft | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [errors, setErrors] = useState<ResponderFillErrors>({})
  const [savingDraft, setSavingDraft] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [unfinishedMediaDrafts, setUnfinishedMediaDrafts] = useState(0)
  const [dropUnfinishedTick, setDropUnfinishedTick] = useState(0)
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(null)
  const [restoredFromDevice, setRestoredFromDevice] = useState(false)
  /** Bumped on every failed submit so an identical second failure still re-focuses. */
  const [submitAttempt, setSubmitAttempt] = useState(0)
  /** Holds the screen just long enough to show the stamp land — 07-motion.md. */
  const [justCompleted, setJustCompleted] = useState(false)
  const plateLookupTail = useRef(Promise.resolve())
  const stashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stashLatest = useRef<(() => void) | null>(null)
  const draftRef = useRef<ResponderFillDraft | null>(null)
  const ctxRef = useRef<ResponderFillContext | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    ctxRef.current = ctx
  }, [ctx])

  const userId = user?.id

  useEffect(() => {
    let active = true

    // Same event already live — don't wipe typing when auth object identity churns.
    if (
      shouldKeepLiveFormBoot({
        loadState,
        hasTypedDraft: Boolean(
          draftRef.current &&
            ctxRef.current &&
            ctxRef.current.eventId === eventId,
        ),
      })
    ) {
      return
    }

    setLoadState('loading')

    if (fillToken) {
      loadFillByToken(fillToken)
        .then((result) => {
          if (!active) return
          if (!result.ok || !result.context) {
            setLoadState('denied')
            return
          }
          setCtx(result.context)
          setDraft(restoreDraft(result.context.assignmentId, result.context.draft))
          setLoadState('ready')
        })
        .catch(() => {
          if (active) setLoadState('denied')
        })
      return () => {
        active = false
      }
    }

    if (!userId) {
      setLoadState('denied')
      return
    }

    fetchResponderFillContext(eventId, userId)
      .then((next) => {
        if (!active) return
        if (!next) {
          setLoadState('denied')
          return
        }
        setCtx(next)
        setDraft(restoreDraft(next.assignmentId, next.draft))
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('denied')
      })

    return () => {
      active = false
    }
    // loadState intentionally omitted — only boot / switch event / token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, userId, fillToken])

  const readOnly =
    ctx?.participationStatus === 'done' || ctx?.eventStatus === 'done'
  const eventClosedWhileOpen =
    ctx?.eventStatus === 'done' && ctx.participationStatus !== 'done'

  /**
   * Prefer the device copy when it differs from the server row. It can only differ
   * if it was written after the last successful save, so it is the newer of the two.
   */
  function restoreDraft(
    assignmentId: string,
    serverDraft: ResponderFillDraft,
  ): ResponderFillDraft {
    const stashed = readFillDraft<ResponderFillDraft>(
      FILL_STASH_SCOPE,
      assignmentId,
      Date.now(),
    )
    if (!stashed) return serverDraft
    if (JSON.stringify(stashed.draft) === JSON.stringify(serverDraft)) {
      return serverDraft
    }
    setLocalSavedAt(stashed.savedAt)
    setRestoredFromDevice(true)
    return stashed.draft
  }

  // Device-local mirror. PRODUCT.md records no offline sync, so without this the
  // narrative in פירוט הטיפול exists only in RAM until an explicit tap.
  useEffect(() => {
    if (!ctx || !draft || readOnly) return

    const flush = () => {
      const current = draftRef.current
      if (!current || !ctxRef.current) return
      stashFillDraft(FILL_STASH_SCOPE, ctxRef.current.assignmentId, current, Date.now())
      setLocalSavedAt(Date.now())
    }
    stashLatest.current = flush

    if (stashTimer.current) clearTimeout(stashTimer.current)
    stashTimer.current = setTimeout(flush, FILL_STASH_DEBOUNCE_MS)

    return () => {
      if (stashTimer.current) clearTimeout(stashTimer.current)
    }
  }, [ctx, draft, readOnly])

  // A backgrounded WebView may never run another timer, so flush immediately.
  useEffect(() => {
    function flushNow() {
      if (document.visibilityState === 'hidden') stashLatest.current?.()
    }
    function flushOnHide() {
      stashLatest.current?.()
    }
    document.addEventListener('visibilitychange', flushNow)
    window.addEventListener('pagehide', flushOnHide)
    return () => {
      document.removeEventListener('visibilitychange', flushNow)
      window.removeEventListener('pagehide', flushOnHide)
    }
  }, [])

  function persistLocalDraft() {
    stashLatest.current?.()
  }

  function leaveFill() {
    persistLocalDraft()
    onBack()
  }

  function handleFillBack() {
    switch (decideFillBack(false, unfinishedMediaDrafts)) {
      case 'drop_unfinished_photo':
        setDropUnfinishedTick((tick) => tick + 1)
        return
      case 'show_docs':
        persistLocalDraft()
        return
      case 'leave':
        leaveFill()
    }
  }

  function patchDraft(patch: Partial<ResponderFillDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function patchOdometerStart(value: string) {
    if (!draft) return
    patchDraft({ odometer_start: value })
    // Clear as they type; judge on blur. A half-typed number is not a wrong number.
    setErrors((current) => ({
      ...current,
      odometer_start: undefined,
      odometer_end: undefined,
    }))
  }

  function patchOdometerEnd(value: string) {
    if (!draft) return
    patchDraft({ odometer_end: value })
    setErrors((current) => ({ ...current, odometer_end: undefined }))
  }

  /** Range check once the number is finished, so the field cannot flash red mid-entry. */
  function checkOdometerRange() {
    if (!draft) return
    const rangeError = odometerRangeError(draft.odometer_start, draft.odometer_end)
    setErrors((current) => ({ ...current, odometer_end: rangeError }))
  }

  function enqueuePlateLookup(plateNumber: string) {
    plateLookupTail.current = plateLookupTail.current.then(async () => {
      const hit = await lookupPlate(plateNumber)
      const key = plateDigits(plateNumber)
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          treated_plates: hit
            ? applyTreatedPlateLookup(current.treated_plates, key, hit)
            : failTreatedPlateLookup(current.treated_plates, key),
        }
      })
    })
  }

  function onCommitTreatedPlate() {
    if (!draft || readOnly) return
    const result = commitTreatedPlate(draft.treated_plate_pending, draft.treated_plates)
    if (!result.ok) {
      setErrors((current) => ({ ...current, treated_plates: result.error }))
      return
    }
    patchDraft({
      treated_plates: result.plates,
      treated_plate_pending: '',
    })
    setErrors((current) => ({ ...current, treated_plates: undefined }))
    enqueuePlateLookup(result.plate.plate_number)
  }

  function onRemoveTreatedPlate(plateDigitsKey: string) {
    if (!draft || readOnly) return
    patchDraft({
      treated_plates: removeTreatedPlate(draft.treated_plates, plateDigitsKey),
    })
  }

  function onLeftWhereChange(plateDigitsKey: string, value: string) {
    if (!draft || readOnly) return
    patchDraft({
      treated_plates: setTreatedPlateLeftWhere(draft.treated_plates, plateDigitsKey, value),
    })
  }

  async function onSaveDraft() {
    if (!ctx || !draft || readOnly) return
    setSavingDraft(true)
    setErrors({})
    const result = fillToken
      ? await saveFillByToken({ fillToken, mode: 'draft', draft })
      : await saveResponderFillDraft({
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
            eventStatus:
              (result.eventStatus as ResponderFillContext['eventStatus'] | null) ??
              current.eventStatus,
          }
        : current,
    )
    show('הטיוטה נשמרה', 'done')
  }

  async function onComplete() {
    if (!ctx || !draft || readOnly) return
    const settled = settleTreatedPlatePending(
      draft.treated_plate_pending,
      draft.treated_plates,
      'complete',
    )
    if (!settled.ok) {
      setErrors({ treated_plates: settled.error })
      show(settled.error, 'alert')
      setSubmitAttempt((n) => n + 1)
      return
    }
    const nextDraft = {
      ...draft,
      treated_plates: settled.plates,
      treated_plate_pending: '',
    }
    if (settled.committed) enqueuePlateLookup(settled.committed.plate_number)
    patchDraft({
      treated_plates: settled.plates,
      treated_plate_pending: '',
    })
    setCompleting(true)
    setErrors({})
    const result = fillToken
      ? await saveFillByToken({ fillToken, mode: 'complete', draft: nextDraft })
      : await completeResponderFill({
          assignmentId: ctx.assignmentId,
          eventId: ctx.eventId,
          draft: nextDraft,
          allowedPlates: ctx.vehicles.map((vehicle) => vehicle.plate),
          totalKm: ctx.totalKm,
          unfinishedMediaDraftCount: unfinishedMediaDrafts,
        })
    setCompleting(false)
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors)
      show(result.error, 'alert')
      setSubmitAttempt((n) => n + 1)
      return
    }
    captureEvent('responder_fill_completed', {
      event_id: ctx.eventId,
      via_token: Boolean(fillToken),
    })
    if (ctx) clearFillDraft(FILL_STASH_SCOPE, ctx.assignmentId)
    show('הדיווח הושלם', 'done')

    // The one choreographed moment in the design system: the responder watches their
    // own stamp land on הושלם before leaving. Without this the record is stamped in
    // the database and never on screen, and the flow ends in disappearance.
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      onCompleted()
      return
    }
    setJustCompleted(true)
    setTimeout(onCompleted, STAMP_PRESS_HOLD_MS)
  }

  useRevealFirstError(submitAttempt)

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
  const kmNote = leadKmPendingNote(ctx.participationStatus, ctx.totalKm)

  return (
    <div className="responder-fill">
      <div className="event-form__panel" data-theme="field">
        <div className="event-form__head">
          <button type="button" className="event-form__back" onClick={handleFillBack}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            חזרה
          </button>
          <div className="event-form__title-row">
            <div className="event-form__title-block">
              <h1 className="t-title">השלמת התיעוד שלי</h1>
              {readOnly ? (
                <p className="t-caption text-muted">
                  {ctx.updated_at
                    ? `הדיווח הושלם ב־${formatDateTime(ctx.updated_at)}. `
                    : 'הדיווח הושלם. '}
                  {kmNote ? `${kmNote}. ` : ''}
                  רק אחמ״ש יכול לערוך לאחר סיום.
                </p>
              ) : localSavedAt ? (
                <p className="t-caption text-muted" aria-live="polite">
                  {`נשמר במכשיר ${fillDraftSavedLabel(localSavedAt)}`}
                </p>
              ) : (
                <p className="t-caption text-muted">
                  הפרטים נשמרים במכשיר עד לשליחה.
                </p>
              )}
            </div>
            {justCompleted ? (
              <StampWithNote label="הושלם" tone="done" press note={kmNote} />
            ) : (
              <StampWithNote {...stamp} note={kmNote} />
            )}
          </div>
        </div>

        {restoredFromDevice && !readOnly ? (
          <p className="banner banner--info t-body" role="status">
            שוחזרו פרטים שנשמרו במכשיר ולא נשלחו. בדקו אותם ולחצו על סיום דיווח.
          </p>
        ) : null}

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
                    label="מספרי כלי רכב"
                    value={
                      draft.treated_plates.length > 0 ? (
                        <TreatedPlateStack plates={draft.treated_plates} />
                      ) : undefined
                    }
                  />
                  <LedgerRow
                    label="הערות לטיפול"
                    value={draft.treatment_notes || undefined}
                  />
                </Ledger>
                {fillToken ? null : (
                  <EventMediaGallery
                    eventId={ctx.eventId}
                    canWrite={Boolean(user) && !ctx.is_cancelled}
                    showEmptyCopy={false}
                    viewerId={user?.id ?? null}
                    error={errors.event_media}
                    onUnfinishedChange={setUnfinishedMediaDrafts}
                    dropUnfinishedTick={dropUnfinishedTick}
                  />
                )}
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
                  onBlur={checkOdometerRange}
                />
                <TextField
                  label='מד אוץ סיום'
                  required
                  numeric
                  inputMode="numeric"
                  value={draft.odometer_end}
                  error={errors.odometer_end}
                  onChange={(event) =>
                    patchOdometerEnd(digitsOnly(event.target.value))
                  }
                  onBlur={checkOdometerRange}
                />
                <TextAreaField
                  label="נתיב נסיעה"
                  required
                  value={draft.route}
                  error={errors.route}
                  placeholder="דרך צומת X וכביש Y וכו'"
                  rows={4}
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
                  rows={5}
                  onChange={(event) => {
                    patchDraft({ treatment_detail: event.target.value })
                    setErrors((current) => ({ ...current, treatment_detail: undefined }))
                  }}
                />
                <TreatedPlatesField
                  plates={draft.treated_plates}
                  pending={draft.treated_plate_pending}
                  error={errors.treated_plates}
                  onPendingChange={(value) => {
                    patchDraft({ treated_plate_pending: value })
                    setErrors((current) => ({ ...current, treated_plates: undefined }))
                  }}
                  onCommit={onCommitTreatedPlate}
                  onRemove={onRemoveTreatedPlate}
                  onLeftWhereChange={onLeftWhereChange}
                />
                {fillToken ? null : (
                  <EventMediaGallery
                    eventId={ctx.eventId}
                    canWrite={Boolean(user) && !ctx.is_cancelled}
                    showEmptyCopy={false}
                    viewerId={user?.id ?? null}
                    error={errors.event_media}
                    onUnfinishedChange={setUnfinishedMediaDrafts}
                    dropUnfinishedTick={dropUnfinishedTick}
                  />
                )}
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
