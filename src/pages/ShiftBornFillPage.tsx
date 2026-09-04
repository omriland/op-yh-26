import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { canEditShiftByDate } from '../lib/shifts'
import {
  fetchShiftBornFillContext,
  saveShiftBornEventFill,
  type ShiftBornFillContext,
  shiftBornCompleteErrors,
  type ShiftBornFillDraft,
  type ShiftBornFillErrors,
} from '../lib/shiftBornFill'
import { lastSavedByLabel, SHIFT_BORN_CHIP } from '../lib/shiftBornEvents'
import { formatDate, plateDigits } from '../lib/format'
import { lookupPlate } from '../lib/plateLookup'
import {
  applyTreatedPlateLookup,
  commitTreatedPlate,
  failTreatedPlateLookup,
  removeTreatedPlate,
  setTreatedPlateLeftWhere,
} from '../lib/treatedPlates'
import { TreatedPlatesField } from '../components/events/TreatedPlatesField'
import { EventMediaGallery } from '../components/events/EventMediaGallery'
import { leftoverEventMediaError } from '../lib/eventMedia'
import { Button } from '../components/ui/Button'
import { CounterStepper } from '../components/ui/CounterStepper'
import { EmptyState } from '../components/ui/EmptyState'
import { FormStickyFooter } from '../components/ui/FormStickyFooter'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { StampChip } from '../components/ui/StampChip'
import { SelectField } from '../components/ui/SelectField'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { EventListSkeleton } from '../components/ui/Skeleton'
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

const SHIFT_BORN_STASH_SCOPE = 'shiftBorn'
const SHIFT_BORN_STASH_DEBOUNCE_MS = 600

type ShiftBornFillPageProps = {
  eventId: string
  onBack: () => void
  onCompleted?: () => void
}

export function ShiftBornFillPage({ eventId, onBack, onCompleted }: ShiftBornFillPageProps) {
  const { user, roles } = useAuth()
  const { show } = useToast()
  const canManage = roles.includes('admin') || roles.includes('shift_lead')
  const [ctx, setCtx] = useState<ShiftBornFillContext | null>(null)
  const [draft, setDraft] = useState<ShiftBornFillDraft | null>(null)
  const [expectedAt, setExpectedAt] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [platePending, setPlatePending] = useState('')
  const [plateError, setPlateError] = useState<string | undefined>()
  const [unfinishedMediaDrafts, setUnfinishedMediaDrafts] = useState(0)
  const [dropUnfinishedTick, setDropUnfinishedTick] = useState(0)
  const [mediaError, setMediaError] = useState<string | undefined>()
  /** Someone else saved this event while it was open here; the local text is kept. */
  const [conflict, setConflict] = useState(false)
  const [errors, setErrors] = useState<ShiftBornFillErrors>({})
  /** Bumped on every failed submit so an identical second failure still re-focuses. */
  const [submitAttempt, setSubmitAttempt] = useState(0)
  const plateLookupTail = useRef(Promise.resolve())
  const draftRef = useRef<ShiftBornFillDraft | null>(null)
  const stashLatest = useRef<(() => void) | null>(null)
  const stashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(null)
  const [restoredFromDevice, setRestoredFromDevice] = useState(false)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    let active = true

    if (
      shouldKeepLiveFormBoot({
        loadState,
        hasTypedDraft: Boolean(draftRef.current && ctx?.event.id === eventId),
      })
    ) {
      return
    }

    setLoadState('loading')
    setPlatePending('')
    setPlateError(undefined)
    fetchShiftBornFillContext(eventId)
      .then((next) => {
        if (!active) return
        if (!next) {
          setLoadState('denied')
          return
        }
        setCtx(next)
        const stashed = readFillDraft<ShiftBornFillDraft>(
          SHIFT_BORN_STASH_SCOPE,
          eventId,
          Date.now(),
        )
        if (
          stashed &&
          JSON.stringify(stashed.draft) !== JSON.stringify(next.draft)
        ) {
          setDraft(stashed.draft)
          setLocalSavedAt(stashed.savedAt)
          setRestoredFromDevice(true)
        } else {
          setDraft(next.draft)
        }
        setExpectedAt(next.expected_updated_at)
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('denied')
      })
    return () => {
      active = false
    }
    // loadState / ctx intentionally omitted — only boot / switch eventId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const shiftDate = ctx?.event.shift?.shift_date ?? ctx?.event.event_date
  const dateOk = shiftDate ? canEditShiftByDate(shiftDate) : false
  const eventDone = ctx?.event.status === 'done'
  const readOnly = eventDone ? !canManage : !(canManage || dateOk)
  const assigned = Boolean(
    user && ctx?.event.responders.some((row) => row.responder_id === user.id),
  )
  const canWriteMedia = assigned && !ctx?.event.is_cancelled

  useEffect(() => {
    if (!draft || loadState !== 'ready' || readOnly) return
    const flush = () => {
      const current = draftRef.current
      if (!current) return
      stashFillDraft(SHIFT_BORN_STASH_SCOPE, eventId, current, Date.now())
      setLocalSavedAt(Date.now())
    }
    stashLatest.current = flush
    if (stashTimer.current) clearTimeout(stashTimer.current)
    stashTimer.current = setTimeout(flush, SHIFT_BORN_STASH_DEBOUNCE_MS)
    return () => {
      if (stashTimer.current) clearTimeout(stashTimer.current)
    }
  }, [draft, loadState, eventId, readOnly])

  useEffect(() => {
    function flushHidden() {
      if (document.visibilityState === 'hidden') stashLatest.current?.()
    }
    function flushHide() {
      stashLatest.current?.()
    }
    document.addEventListener('visibilitychange', flushHidden)
    window.addEventListener('pagehide', flushHide)
    return () => {
      document.removeEventListener('visibilitychange', flushHidden)
      window.removeEventListener('pagehide', flushHide)
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

  function patchDraft(patch: Partial<ShiftBornFillDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function treatedValue(kindId: string): number {
    return draft?.treated.find((row) => row.vehicle_kind_id === kindId)?.quantity ?? 0
  }

  function bumpTreated(kindId: string, delta: number) {
    if (!draft) return
    const prev = treatedValue(kindId)
    const quantity = Math.min(99, Math.max(0, prev + delta))
    const others = draft.treated.filter((row) => row.vehicle_kind_id !== kindId)
    patchDraft({
      treated: quantity > 0 ? [...others, { vehicle_kind_id: kindId, quantity }] : others,
    })
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
    const result = commitTreatedPlate(platePending, draft.treated_plates)
    if (!result.ok) {
      setPlateError(result.error)
      return
    }
    patchDraft({ treated_plates: result.plates })
    setPlatePending('')
    setPlateError(undefined)
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

  async function persist(complete: boolean) {
    if (!draft || !expectedAt) return
    const result = await saveShiftBornEventFill({
      eventId,
      expectedUpdatedAt: expectedAt,
      draft,
      complete,
    })
    if (!result.ok) {
      show(result.error, 'alert')
      if (result.error.includes('רעננו')) {
        const next = await fetchShiftBornFillContext(eventId)
        if (next) {
          // Never replace what the user typed. Conflict detection exists to prevent
          // loss; adopting the server copy here would guarantee it, and would
          // penalise precisely the person who was still working. Take the new
          // token so a deliberate re-save can win, keep their text, and say so.
          setCtx((current) => (current ? { ...current, ...next, draft: current.draft } : next))
          setExpectedAt(next.expected_updated_at)
          setConflict(true)
        }
      }
      return false
    }
    setExpectedAt(result.updated_at)
    setConflict(false)
    return true
  }

  async function onSave() {
    setSaving(true)
    const ok = await persist(false)
    setSaving(false)
    if (ok) show('הטיוטה נשמרה', 'done')
  }

  async function onComplete() {
    if (!draft) return
    const fieldErrors = shiftBornCompleteErrors(draft)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      show('יש להשלים את השדות המסומנים כדי לסיים את הדיווח.', 'alert')
      setSubmitAttempt((n) => n + 1)
      return
    }
    setErrors({})
    const leftover = leftoverEventMediaError(unfinishedMediaDrafts, 'complete')
    if (leftover) {
      setMediaError(leftover)
      show(leftover, 'alert')
      return
    }
    setCompleting(true)
    const ok = await persist(true)
    setCompleting(false)
    if (ok) {
      clearFillDraft(SHIFT_BORN_STASH_SCOPE, eventId)
      show('הדיווח הושלם', 'done')
      onCompleted?.()
    }
  }

  useRevealFirstError(submitAttempt)

  useDesktopFormSubmit(() => void onSave(), {
    enabled: loadState === 'ready' && Boolean(draft) && !readOnly && !saving && !completing,
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

  const savedLabel = lastSavedByLabel(ctx.event.last_saved?.full_name)

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
              <h1 className="t-title">תיעוד אירוע ממשמרת</h1>
              {savedLabel ? <p className="t-caption text-muted">{savedLabel}</p> : null}
              {restoredFromDevice && !readOnly && localSavedAt ? (
                <p className="t-caption text-muted">
                  {`שוחזר מהמכשיר ${fillDraftSavedLabel(localSavedAt)}`}
                </p>
              ) : null}
            </div>
            <StampChip label={SHIFT_BORN_CHIP} tone="draft" />
          </div>
        </div>

        {conflict ? (
          <p className="banner banner--alert t-body" role="alert">
            מישהו שמר את האירוע בזמן שמילאתם. הפרטים שהזנתם נשמרו כאן ולא נמחקו.
            בדקו אותם ולחצו שוב על שמירה כדי לשמור את הגרסה שלכם.
          </p>
        ) : null}

        <section className="card responder-fill__context">
          <Ledger>
            <LedgerRow label="תאריך" value={formatDate(ctx.event.event_date)} numeric />
            <LedgerRow label="סוג אירוע" value={ctx.event.event_type?.name ?? undefined} />
          </Ledger>
        </section>

        <section className="form-section responder-fill__section">
          <h2 className="form-section__heading">פרטי הטיפול</h2>
          <div className="form-section__fields">
            <TextField
              label="מספר אירוע"
              numeric
              inputMode="numeric"
              value={draft.police_event_id}
              disabled={readOnly}
              onChange={(event) => patchDraft({ police_event_id: event.target.value })}
            />
            <SelectField
              label="כביש"
              searchable
              required
              error={errors.road_id}
              searchPlaceholder="חיפוש כביש"
              value={draft.road_id}
              disabled={readOnly}
              options={ctx.roads.map((road) => ({ value: road.id, label: road.name }))}
              onChange={(event) => patchDraft({ road_id: event.target.value })}
            />
            <TextField
              label="מיקום"
              required
              error={errors.location}
              placeholder="למשל: מחלף שורק, לכיוון צפון"
              value={draft.location}
              disabled={readOnly}
              onChange={(event) => patchDraft({ location: event.target.value })}
            />
            <TextAreaField
              label="פירוט הטיפול"
              required
              error={errors.treatment_detail}
              value={draft.treatment_detail}
              disabled={readOnly}
              rows={5}
              onChange={(event) => patchDraft({ treatment_detail: event.target.value })}
            />
            <TreatedPlatesField
              plates={draft.treated_plates}
              pending={platePending}
              error={plateError}
              disabled={readOnly}
              onPendingChange={(value) => {
                setPlatePending(value)
                setPlateError(undefined)
              }}
              onCommit={onCommitTreatedPlate}
              onRemove={onRemoveTreatedPlate}
              onLeftWhereChange={onLeftWhereChange}
            />
            <EventMediaGallery
              eventId={eventId}
              canWrite={Boolean(canWriteMedia)}
              showEmptyCopy={false}
              viewerId={user?.id ?? null}
              error={mediaError}
              dropUnfinishedTick={dropUnfinishedTick}
              onUnfinishedChange={(count) => {
                setUnfinishedMediaDrafts(count)
                if (count === 0) setMediaError(undefined)
              }}
            />
            <div className="assignment-card__treated">
              <p className="t-label text-secondary">רכבים שטופלו</p>
              <div className="assignment-card__steppers">
                {ctx.vehicleKinds.map((kind) => (
                  <CounterStepper
                    key={kind.id}
                    label={kind.name}
                    value={treatedValue(kind.id)}
                    disabled={readOnly}
                    onDelta={(delta) => bumpTreated(kind.id, delta)}
                  />
                ))}
              </div>
            </div>
            <TextAreaField
              label="הערות"
              value={draft.treatment_notes}
              disabled={readOnly}
              onChange={(event) => patchDraft({ treatment_notes: event.target.value })}
            />
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
                loading={saving}
                loadingLabel="שומר…"
                disabled={completing}
                onClick={() => void onSave()}
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
