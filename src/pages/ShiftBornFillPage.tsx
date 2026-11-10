import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { jerusalemToday } from '../lib/shifts'
import {
  fetchShiftBornFillContext,
  resolveShiftBornStash,
  saveShiftBornEventFill,
  saveShiftBornEventType,
  type ShiftBornFillContext,
  shiftBornCompleteErrors,
  type ShiftBornFillDraft,
  type ShiftBornFillErrors,
  type ShiftBornStash,
} from '../lib/shiftBornFill'
import {
  lastSavedByLabel,
  SHIFT_BORN_CHIP,
  shiftBornBeforeShiftDate,
  shiftBornFillAccess,
} from '../lib/shiftBornEvents'
import { formatDate, plateDigits, policeEventIdForInput, POLICE_EVENT_ID_MAX_LENGTH } from '../lib/format'
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
import {
  leftoverEventMediaError,
  linkPendingMedia,
  type PendingMediaLink,
} from '../lib/eventMedia'
import { EventSaveRulesDialog } from '../components/events/EventSaveRulesDialog'
import {
  skippedPhotoDigits,
  vehiclePhotosIssue,
  type SaveRuleIssue,
} from '../lib/eventSaveRules'
import { fetchEventPhotoCoverage, withPendingPhotoLinks } from '../lib/eventVehiclePhotos'
import { treatmentDetailCounter } from '../lib/treatmentDetail'
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
  const isSuperAdmin = roles.includes('super_admin')
  const [ctx, setCtx] = useState<ShiftBornFillContext | null>(null)
  const [draft, setDraft] = useState<ShiftBornFillDraft | null>(null)
  const [expectedAt, setExpectedAt] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [eventTypeId, setEventTypeId] = useState('')
  const [savingType, setSavingType] = useState(false)
  const [platePending, setPlatePending] = useState('')
  const [plateError, setPlateError] = useState<string | undefined>()
  const [unfinishedMediaDrafts, setUnfinishedMediaDrafts] = useState(0)
  const [dropUnfinishedTick, setDropUnfinishedTick] = useState(0)
  /** Photos linked to a vehicle the report has not saved yet. */
  const pendingMediaLinks = useRef<PendingMediaLink[]>([])
  const [vehiclesSavedTick, setVehiclesSavedTick] = useState(0)
  const onPendingLinksChange = useCallback((links: PendingMediaLink[]) => {
    pendingMediaLinks.current = links
  }, [])
  const [mediaError, setMediaError] = useState<string | undefined>()
  const [photoPrompt, setPhotoPrompt] = useState<{
    issues: SaveRuleIssue[]
    complete: boolean
  } | null>(null)
  /** Vehicles the user chose to save without a photo; a vehicle added later is still asked about. */
  const photoSkippedRef = useRef<Set<string>>(new Set())
  /** Someone else saved this event while it was open here; the local text is kept. */
  const [conflict, setConflict] = useState(false)
  const [errors, setErrors] = useState<ShiftBornFillErrors>({})
  /** Bumped on every failed submit so an identical second failure still re-focuses. */
  const [submitAttempt, setSubmitAttempt] = useState(0)
  const plateLookupTail = useRef(Promise.resolve())
  const draftRef = useRef<ShiftBornFillDraft | null>(null)
  /** The server copy as of the last load or save, and the version it carries. */
  const savedDraftRef = useRef<ShiftBornFillDraft | null>(null)
  const expectedAtRef = useRef<string | null>(null)
  const stashLatest = useRef<(() => void) | null>(null)
  const stashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(null)
  const [restoredFromDevice, setRestoredFromDevice] = useState(false)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    expectedAtRef.current = expectedAt
  }, [expectedAt])

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
        setEventTypeId(next.event.event_type_id ?? '')
        savedDraftRef.current = next.draft
        const stashed = readFillDraft<ShiftBornStash>(
          SHIFT_BORN_STASH_SCOPE,
          eventId,
          Date.now(),
        )
        // A report this user can no longer edit shows the server's text, never an
        // old device copy (e.g. a teammate completed it after these edits).
        const nextReadOnly = shiftBornFillAccess({
          canManage,
          onCrew: Boolean(user && next.event.responders.some((row) => row.responder_id === user.id)),
          beforeShiftDate: shiftBornBeforeShiftDate(next.event, jerusalemToday()),
          done: next.event.status === 'done',
        }).readOnly
        const resolved = resolveShiftBornStash(next, nextReadOnly ? null : (stashed?.draft ?? null))
        setDraft(resolved.draft)
        if (resolved.restored && stashed) {
          setLocalSavedAt(stashed.savedAt)
          setRestoredFromDevice(true)
          // Same banner as a save that lost the race: the text is kept, and a
          // deliberate save is what replaces the teammate's version.
          setConflict(resolved.serverMovedOn)
        }
        setExpectedAt(next.expected_updated_at)
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
    // loadState / ctx intentionally omitted — only boot / switch eventId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const assigned = Boolean(
    user && ctx?.event.responders.some((row) => row.responder_id === user.id),
  )
  const beforeShiftDate = ctx ? shiftBornBeforeShiftDate(ctx.event, jerusalemToday()) : false
  const { readOnly, note: readOnlyNote } = shiftBornFillAccess({
    canManage,
    onCrew: assigned,
    beforeShiftDate,
    done: ctx?.event.status === 'done',
  })
  const canWriteMedia = assigned && !ctx?.event.is_cancelled && !beforeShiftDate

  useEffect(() => {
    if (!draft || loadState !== 'ready' || readOnly) return
    const flush = () => {
      const current = draftRef.current
      if (!current) return
      // Nothing typed since the last load or save: a copy would only be restored
      // later over a teammate's newer save.
      if (JSON.stringify(current) === JSON.stringify(savedDraftRef.current)) {
        clearFillDraft(SHIFT_BORN_STASH_SCOPE, eventId)
        return
      }
      const stash: ShiftBornStash = {
        ...current,
        base_updated_at: expectedAtRef.current ?? undefined,
      }
      stashFillDraft(SHIFT_BORN_STASH_SCOPE, eventId, stash, Date.now())
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

  async function onEventTypeChange(nextTypeId: string) {
    if (!ctx || savingType) return
    const previousTypeId = ctx.event.event_type_id ?? eventTypeId
    if (nextTypeId === previousTypeId) return
    const expected = expectedAtRef.current
    if (!expected) return
    const shown = eventTypeId
    setEventTypeId(nextTypeId)
    setSavingType(true)
    const result = await saveShiftBornEventType({
      eventId,
      previousTypeId,
      nextTypeId,
      expectedUpdatedAt: expected,
    })
    setSavingType(false)
    if (!result.ok) {
      setEventTypeId(shown)
      show(result.error, 'alert')
      return
    }
    if ('unchanged' in result) return
    setExpectedAt(result.updated_at)
    setCtx((current) => {
      if (!current) return current
      const name =
        current.eventTypes.find((row) => row.id === nextTypeId)?.name ??
        current.event.event_type?.name ??
        null
      return {
        ...current,
        expected_updated_at: result.updated_at,
        event: {
          ...current.event,
          event_type_id: nextTypeId,
          event_type: name ? { name } : current.event.event_type,
          updated_at: result.updated_at,
        },
      }
    })
    show('סוג האירוע נשמר', 'done')
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

  /**
   * Opens the "no photo for these vehicles" prompt when one is due. Counts photos
   * saved on the event and photos linked to a vehicle this form has not saved yet.
   */
  async function photoPromptOpened(complete: boolean): Promise<boolean> {
    if (!draft) return false
    const saved = await fetchEventPhotoCoverage(eventId)
    const covered = saved ? withPendingPhotoLinks(saved, pendingMediaLinks.current) : null
    const issue = vehiclePhotosIssue(draft.treated_plates, covered, photoSkippedRef.current)
    if (!issue) return false
    setPhotoPrompt({ issues: [issue], complete })
    return true
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
          setEventTypeId(next.event.event_type_id ?? '')
          setExpectedAt(next.expected_updated_at)
          setConflict(true)
        }
      }
      return false
    }
    savedDraftRef.current = draft
    setExpectedAt(result.updated_at)
    setConflict(false)
    // The save replaced the vehicle rows: link waiting photos, then re-read every link.
    if (pendingMediaLinks.current.length > 0) {
      await linkPendingMedia(eventId, pendingMediaLinks.current, { eventId })
    }
    setVehiclesSavedTick((n) => n + 1)
    return true
  }

  async function onSave() {
    setSaving(true)
    if (await photoPromptOpened(false)) {
      setSaving(false)
      return
    }
    const ok = await persist(false)
    setSaving(false)
    if (ok) show('הטיוטה נשמרה', 'done')
  }

  async function onComplete() {
    if (!draft) return
    const fieldErrors = shiftBornCompleteErrors(draft, Boolean(ctx?.event.is_cancelled))
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
    if (await photoPromptOpened(true)) {
      setCompleting(false)
      return
    }
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

  if (loadState === 'denied' || loadState === 'error') {
    return (
      <EmptyState
        icon={<FileWarning size={40} strokeWidth={1.75} />}
        title={
          loadState === 'error'
            ? 'טעינת האירוע נכשלה. בדקו את החיבור ונסו שוב.'
            : 'אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.'
        }
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

        {readOnlyNote ? (
          <p className="banner banner--info t-body" role="status">
            {readOnlyNote}
          </p>
        ) : null}

        {conflict ? (
          <p className="banner banner--alert t-body" role="alert">
            מישהו שמר את האירוע בזמן שמילאתם. הפרטים שהזנתם נשמרו כאן ולא נמחקו.
            בדקו אותם ולחצו שוב על שמירה כדי לשמור את הגרסה שלכם.
          </p>
        ) : null}

        <section className="card responder-fill__context stack-4">
          <Ledger>
            <LedgerRow label="תאריך" value={formatDate(ctx.event.event_date)} numeric />
            {isSuperAdmin ? null : (
              <LedgerRow label="סוג אירוע" value={ctx.event.event_type?.name ?? undefined} />
            )}
          </Ledger>
          {isSuperAdmin ? (
            <SelectField
              label="סוג אירוע"
              required
              value={eventTypeId}
              disabled={savingType}
              options={ctx.eventTypes
                .map((row) => ({ value: row.id, label: row.name }))
                .concat(
                  eventTypeId && !ctx.eventTypes.some((row) => row.id === eventTypeId)
                    ? [{ value: eventTypeId, label: ctx.event.event_type?.name ?? 'סוג אירוע' }]
                    : [],
                )}
              onChange={(event) => void onEventTypeChange(event.target.value)}
            />
          ) : null}
        </section>

        <section className="form-section responder-fill__section">
          <h2 className="form-section__heading">פרטי הטיפול</h2>
          <div className="form-section__fields">
            <TextField
              label="מספר אירוע"
              numeric
              isolate
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={POLICE_EVENT_ID_MAX_LENGTH}
              value={draft.police_event_id}
              disabled={readOnly}
              onChange={(event) =>
                patchDraft({ police_event_id: policeEventIdForInput(event.target.value) })
              }
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
              required={!ctx.event.is_cancelled}
              counter={
                ctx.event.is_cancelled
                  ? undefined
                  : treatmentDetailCounter(draft.treatment_detail)
              }
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
              formVehicles={draft.treated_plates}
              plateOwner={{ eventId }}
              onPendingLinksChange={onPendingLinksChange}
              vehiclesSavedTick={vehiclesSavedTick}
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
      <EventSaveRulesDialog
        open={Boolean(photoPrompt)}
        issues={photoPrompt?.issues ?? []}
        onBack={() => setPhotoPrompt(null)}
        onProceed={() => {
          if (!photoPrompt) return
          for (const digits of skippedPhotoDigits(photoPrompt.issues)) {
            photoSkippedRef.current.add(digits)
          }
          setPhotoPrompt(null)
          if (photoPrompt.complete) void onComplete()
          else void onSave()
        }}
      />
    </div>
  )
}
