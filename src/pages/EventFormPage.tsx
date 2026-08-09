import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronDown, ChevronRight, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  deriveEventStatus,
  emptyEventDraft,
  fetchAssignableUsers,
  fetchEventForEdit,
  fetchEventLookups,
  hasEventMinimum,
  isOvernightEnd,
  mergeAssignmentIds,
  saveEventForm,
  validateEventMinimum,
  type AssignableUser,
  type EventFormDraft,
  type EventFormErrors,
  type EventLookups,
  type ResponderDraft,
} from '../lib/eventForm'
import { viewerStamp } from '../lib/status'
import { monoClass } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Button, IconButton } from '../components/ui/Button'
import { CounterStepper } from '../components/ui/CounterStepper'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { SelectField } from '../components/ui/SelectField'
import { StampChip } from '../components/ui/StampChip'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { TimeField } from '../components/ui/TimeField'
import { Toggle } from '../components/ui/Toggle'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

type EventFormPageProps = {
  eventId?: string
  /** Expand + scroll this assigned responder when the form opens. */
  focusResponderId?: string
  onCancel: () => void
  onSaved: (eventId: string) => void
  /** Keep parent route in sync after the first autosave creates the row. */
  onEventId?: (eventId: string) => void
}

type SavePulse = 'idle' | 'saving' | 'saved' | 'error'

export function EventFormPage({
  eventId,
  focusResponderId,
  onCancel,
  onSaved,
  onEventId,
}: EventFormPageProps) {
  const { user, profile, roles } = useAuth()
  const { show } = useToast()
  const canManage = roles.includes('admin') || roles.includes('shift_lead')
  const assignSearchRef = useRef<HTMLInputElement>(null)

  const [lookups, setLookups] = useState<EventLookups | null>(null)
  const [roster, setRoster] = useState<AssignableUser[]>([])
  const [draft, setDraft] = useState<EventFormDraft | null>(null)
  const [baseline, setBaseline] = useState<string>('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [errors, setErrors] = useState<EventFormErrors>({})
  const [saving, setSaving] = useState(false)
  const [savePulse, setSavePulse] = useState<SavePulse>('idle')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<ResponderDraft | null>(null)
  const [overnightPrompt, setOvernightPrompt] = useState<{
    options?: { navigate?: boolean; revealErrors?: boolean }
  } | null>(null)

  const draftRef = useRef<EventFormDraft | null>(null)
  const lookupsRef = useRef<EventLookups | null>(null)
  const baselineRef = useRef('')
  const saveChain = useRef(Promise.resolve())
  const savedTimer = useRef<number | null>(null)
  const skipReloadForId = useRef<string | null>(null)
  const overnightConfirmed = useRef(new Set<string>())

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    lookupsRef.current = lookups
  }, [lookups])

  useEffect(() => {
    baselineRef.current = baseline
  }, [baseline])

  useEffect(() => {
    if (!canManage || !user || !profile) {
      setLoadState('denied')
      return
    }

    // Autosave creates the row then parent sets eventId — don't wipe the live form.
    if (eventId && skipReloadForId.current === eventId) {
      skipReloadForId.current = null
      return
    }
    if (eventId && draftRef.current?.id === eventId && loadState === 'ready') {
      return
    }

    let active = true
    setLoadState('loading')

    Promise.all([
      fetchEventLookups(),
      fetchAssignableUsers(),
      eventId ? fetchEventForEdit(eventId) : Promise.resolve(null),
    ])
      .then(([nextLookups, nextRoster, existing]) => {
        if (!active) return
        if (eventId && !existing) {
          setLoadState('denied')
          return
        }
        setLookups(nextLookups)
        setRoster(nextRoster)
        let nextDraft =
          existing ??
          emptyEventDraft({
            full_name: profile.full_name,
            callsign: profile.callsign,
          })
        if (focusResponderId) {
          nextDraft = {
            ...nextDraft,
            responders: nextDraft.responders.map((row) =>
              row.responder_id === focusResponderId ? { ...row, expanded: true } : row,
            ),
          }
        }
        draftRef.current = nextDraft
        seedOvernightConfirmed(nextDraft)
        setDraft(nextDraft)
        setBaseline(JSON.stringify(nextDraft))
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('denied')
      })

    return () => {
      active = false
    }
    // loadState intentionally omitted — only boot / switch eventId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, eventId, user, profile, focusResponderId])

  useEffect(() => {
    if (loadState !== 'ready' || !focusResponderId) return
    const node = document.querySelector(
      `[data-responder-id="${CSS.escape(focusResponderId)}"]`,
    )
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [loadState, focusResponderId])

  const dirty = draft ? JSON.stringify(draft) !== baseline : false

  const pickerOptions = useMemo(() => {
    if (!draft) return []
    const taken = new Set(draft.responders.map((row) => row.responder_id))
    const needle = pickerQuery.trim().toLowerCase()
    return roster.filter((person) => {
      if (taken.has(person.id)) return false
      if (!needle) return true
      return (
        person.full_name.toLowerCase().includes(needle) ||
        person.callsign.toLowerCase().includes(needle)
      )
    })
  }, [draft, roster, pickerQuery])

  function markSavedPulse() {
    setSavePulse('saved')
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSavePulse('idle'), 1600)
  }

  function persistLatest(options?: {
    navigate?: boolean
    revealErrors?: boolean
    overnightOk?: boolean
  }): Promise<boolean> {
    if (!user) return Promise.resolve(false)

    const run = async () => {
      const current = draftRef.current
      const currentLookups = lookupsRef.current
      if (!current || !currentLookups) return false

      const snapshot = JSON.stringify(current)
      // Autosave often already flushed (e.g. after הקצאת כונן). Explicit
      // שמירת אירוע must still confirm + leave the form.
      if (snapshot === baselineRef.current && current.id) {
        if (options?.navigate) {
          markSavedPulse()
          show('האירוע נשמר', 'done')
          onSaved(current.id)
        }
        return true
      }

      if (!hasEventMinimum(current)) {
        // Don't create a row until date + type + road are set; stay quiet on background autosave.
        if (!current.id && !options?.navigate && !options?.revealErrors) {
          setSavePulse('idle')
          return false
        }
        const fieldErrors = validateEventMinimum(current)
        setErrors(fieldErrors)
        setSavePulse('error')
        if (options?.navigate || options?.revealErrors) {
          show('יש למלא תאריך, סוג אירוע וכביש כדי ליצור אירוע.', 'alert')
          const first = document.querySelector('[aria-invalid="true"]')
          first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        return false
      }

      const pendingOvernight = current.responders.filter(
        (row) =>
          isOvernightEnd(row.start_time, row.end_time) &&
          !overnightConfirmed.current.has(row.key),
      )
      if (pendingOvernight.length > 0 && !options?.overnightOk) {
        setOvernightPrompt({ options })
        return false
      }
      for (const row of current.responders) {
        if (isOvernightEnd(row.start_time, row.end_time)) {
          overnightConfirmed.current.add(row.key)
        }
      }

      setSavePulse('saving')
      const result = await saveEventForm({
        draft: current,
        shiftLeadId: user.id,
        vehicleKinds: currentLookups.vehicleKinds,
      })

      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors)
        setSavePulse('error')
        if (options?.navigate || options?.revealErrors || options?.overnightOk) {
          show(result.error, 'alert')
        }
        return false
      }
      setErrors({})

      // Merge server ids into the *latest* draft — never replace with the pre-await
      // snapshot (stepper taps during save would otherwise get wiped).
      const latest = draftRef.current ?? current
      const savedWithIds: EventFormDraft = {
        ...current,
        id: result.eventId,
        status: result.status,
        responders: mergeAssignmentIds(current.responders, result.assignmentIds),
      }
      const nextDraft: EventFormDraft = {
        ...latest,
        id: result.eventId,
        status: result.status,
        responders: mergeAssignmentIds(latest.responders, result.assignmentIds),
      }
      draftRef.current = nextDraft
      setDraft(nextDraft)
      if (!current.id) skipReloadForId.current = result.eventId
      onEventId?.(result.eventId)

      const stillDirty = JSON.stringify(nextDraft) !== JSON.stringify(savedWithIds)
      if (stillDirty) {
        markSavedPulse()
        // Queue a follow-up save (do not call persistLatest from inside this run —
        // that deadlocks the saveChain promise). Keep navigate/reveal flags.
        const followUp = { ...options, overnightOk: true as const }
        queueMicrotask(() => {
          void persistLatest(followUp)
        })
        return true
      }

      const nextSnapshot = JSON.stringify(nextDraft)
      baselineRef.current = nextSnapshot
      setBaseline(nextSnapshot)
      markSavedPulse()

      if (options?.navigate) {
        show('האירוע נשמר', 'done')
        onSaved(result.eventId)
      }
      return true
    }

    const queued = saveChain.current.then(run, run)
    saveChain.current = queued.then(
      () => undefined,
      () => undefined,
    )
    return queued
  }

  function updateDraft(patch: Partial<EventFormDraft>) {
    setDraft((current) => {
      if (!current) return current
      const next = { ...current, ...patch }
      draftRef.current = next
      return next
    })
    if (errors.form) setErrors((current) => ({ ...current, form: undefined }))
  }

  function seedOvernightConfirmed(next: EventFormDraft) {
    overnightConfirmed.current.clear()
    for (const row of next.responders) {
      if (isOvernightEnd(row.start_time, row.end_time)) {
        overnightConfirmed.current.add(row.key)
      }
    }
  }

  function updateResponder(key: string, patch: Partial<ResponderDraft>) {
    setDraft((current) => {
      if (!current) return current
      const next = {
        ...current,
        responders: current.responders.map((row) => {
          if (row.key !== key) return row
          const merged = { ...row, ...patch }
          if (!isOvernightEnd(merged.start_time, merged.end_time)) {
            overnightConfirmed.current.delete(key)
          } else if ('start_time' in patch || 'end_time' in patch) {
            // Times changed while still overnight — ask again on next save.
            overnightConfirmed.current.delete(key)
          }
          return merged
        }),
      }
      draftRef.current = next
      return next
    })
  }

  function bumpTreated(responderKey: string, kindId: string, delta: number) {
    const kinds = lookupsRef.current?.vehicleKinds
    if (!kinds) return
    setDraft((current) => {
      if (!current) return current
      const next = {
        ...current,
        responders: current.responders.map((row) => {
          if (row.key !== responderKey) return row
          const treated = kinds.map((item) => {
            const prev =
              row.treated.find((entry) => entry.vehicle_kind_id === item.id)?.quantity ?? 0
            const quantity =
              item.id === kindId ? Math.min(99, Math.max(0, prev + delta)) : prev
            return { vehicle_kind_id: item.id, quantity }
          })
          return { ...row, treated }
        }),
      }
      draftRef.current = next
      return next
    })
    queueMicrotask(() => void persistLatest())
  }

  function openAssigner() {
    setPickerOpen(true)
    queueMicrotask(() => assignSearchRef.current?.focus())
  }

  function assignResponder(person: AssignableUser) {
    if (!lookups || !draft) return
    if (!hasEventMinimum(draft)) {
      void persistLatest({ revealErrors: true })
      return
    }
    const treated = lookups.vehicleKinds.map((kind) => ({
      vehicle_kind_id: kind.id,
      quantity: 0,
    }))
    const next: EventFormDraft = {
      ...draft,
      responders: [
        ...draft.responders,
        {
          key: `new-${person.id}-${Date.now()}`,
          responder_id: person.id,
          full_name: person.full_name,
          callsign: person.callsign,
          start_time: '',
          end_time: '',
          total_km: '',
          emergency_means: false,
          treated,
          status: 'pending',
          hasOwnedData: false,
          expanded: true,
        },
      ],
    }
    draftRef.current = next
    setDraft(next)
    setPickerQuery('')
    setPickerOpen(false)
    void persistLatest({ revealErrors: true }).then((ok) => {
      if (ok) show('הכונן נוסף לאירוע', 'done')
    })
  }

  function requestRemove(responder: ResponderDraft) {
    if (
      responder.hasOwnedData ||
      responder.total_km ||
      responder.treated.some((row) => row.quantity > 0)
    ) {
      setRemoveTarget(responder)
      return
    }
    removeResponder(responder.key)
  }

  function removeResponder(key: string) {
    setDraft((current) => {
      if (!current) return current
      const next = {
        ...current,
        responders: current.responders.filter((row) => row.key !== key),
      }
      draftRef.current = next
      queueMicrotask(() => void persistLatest())
      return next
    })
    setRemoveTarget(null)
  }

  async function persistExplicit() {
    if (!draft || !user || !lookups) return
    setSaving(true)
    setErrors({})
    await persistLatest({ navigate: true, revealErrors: true })
    setSaving(false)
  }

  async function leaveForm() {
    if (dirty) {
      await persistLatest()
    }
    onCancel()
  }

  function requestCancel() {
    if (dirty && savePulse === 'error') {
      setLeaveConfirm(true)
      return
    }
    void leaveForm()
  }

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden') void persistLatest()
    }
    function onPageHide() {
      void persistLatest()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    }
  }, [user])

  if (!canManage || loadState === 'denied') {
    return (
      <EmptyState
        icon={<UserRound size={40} strokeWidth={1.75} />}
        title="אין לך הרשאה לפעולה זו."
        action={
          <Button variant="secondary" onClick={onCancel}>
            חזרה
          </Button>
        }
      />
    )
  }

  if (loadState === 'loading' || !draft || !lookups) {
    return <EventListSkeleton count={4} />
  }

  const displayStatus = deriveEventStatus(draft)
  const isEdit = Boolean(draft.id)
  const title = isEdit
    ? draft.police_event_id
      ? `אירוע ${draft.police_event_id} — עריכה`
      : 'עריכת אירוע'
    : 'אירוע חדש'

  const needsMinimum = !hasEventMinimum(draft)
  const saveHint =
    savePulse === 'saving'
      ? 'שומר…'
      : savePulse === 'saved'
        ? 'נשמר'
        : savePulse === 'error'
          ? needsMinimum
            ? 'יש למלא תאריך, סוג אירוע וכביש.'
            : 'השמירה נכשלה — נסו שוב'
          : needsMinimum && !draft.id
            ? 'יש למלא תאריך, סוג אירוע וכביש כדי ליצור את האירוע.'
            : displayStatus === 'draft'
              ? 'נשמר כטיוטה עד שישובץ כונן.'
              : 'השינויים נשמרים אוטומטית.'

  return (
    <div className="event-form">
      <div className="event-form__panel" data-theme="field">
        <header className="event-form__head">
          <button type="button" className="event-form__back" onClick={requestCancel}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>חזרה</span>
          </button>

          <div className="event-form__title-row">
            <div className="event-form__title-block">
              <h1 className="t-title">{title}</h1>
              <p
                className={[
                  't-caption',
                  savePulse === 'error' ? 'field__hint--error' : 'text-muted',
                ].join(' ')}
                aria-live="polite"
              >
                {saveHint}
              </p>
            </div>
            <StampChip {...viewerStamp(displayStatus, null)} />
          </div>
        </header>

        <div className="event-form__sections">
          <section className="form-section">
            <h2 className="form-section__heading">
              <span className="form-section__counter">חלק א׳</span>
              <span>פרטי האירוע</span>
            </h2>
            <div className="form-section__fields">
              <Ledger>
                <LedgerRow
                  label="אחמ״ש"
                  value={`${draft.shift_lead.full_name} · ${draft.shift_lead.callsign}`}
                />
              </Ledger>

              <div className="event-form__grid">
                <TextField
                  label="תאריך"
                  type="date"
                  required
                  value={draft.event_date}
                  error={errors.event_date}
                  onChange={(event) => {
                    updateDraft({ event_date: event.target.value })
                    setErrors((current) => ({ ...current, event_date: undefined }))
                  }}
                  onBlur={() => void persistLatest()}
                  affix={
                    <span className="field__affix" aria-hidden="true">
                      <Calendar size={20} strokeWidth={1.75} />
                    </span>
                  }
                />

                <TextField
                  label="מספר אירוע"
                  numeric
                  value={draft.police_event_id}
                  error={errors.police_event_id}
                  onChange={(event) => updateDraft({ police_event_id: event.target.value })}
                  onBlur={() => void persistLatest()}
                />

                <SelectField
                  label="שלוחה"
                  value={draft.district_id}
                  error={errors.district_id}
                  options={lookups.districts.map((row) => ({ value: row.id, label: row.name }))}
                  onChange={(event) => {
                    updateDraft({ district_id: event.target.value })
                    queueMicrotask(() => void persistLatest())
                  }}
                />

                <TextField
                  label="או״ק ניידת"
                  numeric
                  value={draft.patrol_callsign}
                  onChange={(event) => updateDraft({ patrol_callsign: event.target.value })}
                  onBlur={() => void persistLatest()}
                />

                <SelectField
                  label="סוג אירוע"
                  required
                  value={draft.event_type_id}
                  error={errors.event_type_id}
                  options={lookups.eventTypes.map((row) => ({ value: row.id, label: row.name }))}
                  onChange={(event) => {
                    updateDraft({ event_type_id: event.target.value })
                    setErrors((current) => ({ ...current, event_type_id: undefined }))
                    queueMicrotask(() => void persistLatest())
                  }}
                />

                <SelectField
                  label="כביש"
                  required
                  value={draft.road_id}
                  error={errors.road_id}
                  options={lookups.roads.map((row) => ({ value: row.id, label: row.name }))}
                  onChange={(event) => {
                    updateDraft({ road_id: event.target.value })
                    setErrors((current) => ({ ...current, road_id: undefined }))
                    queueMicrotask(() => void persistLatest())
                  }}
                />
              </div>

              <TextField
                label="מיקום"
                placeholder="למשל: מחלף שורק, לכיוון צפון"
                value={draft.location}
                onChange={(event) => updateDraft({ location: event.target.value })}
                onBlur={() => void persistLatest()}
              />

              <TextAreaField
                label="הערות"
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
                onBlur={() => void persistLatest()}
              />
            </div>
          </section>

          <section className="form-section">
            <h2 className="form-section__heading">
              <span className="form-section__counter">חלק ב׳</span>
              <span>כוננים</span>
            </h2>
            <div className="form-section__fields">
              <div className="responder-assign">
                <div className="responder-assign__toolbar">
                  <p className="t-label text-secondary">
                    {draft.responders.length === 0
                      ? 'טרם הוקצו כוננים · טיוטה'
                      : `${draft.responders.length} כוננים משובצים`}
                  </p>
                  <Button
                    variant="secondary"
                    icon={<Plus size={20} strokeWidth={1.75} />}
                    onClick={() => (pickerOpen ? setPickerOpen(false) : openAssigner())}
                    aria-expanded={pickerOpen}
                  >
                    {pickerOpen ? 'סגירת הקצאה' : 'הקצאת כוננים'}
                  </Button>
                </div>

                {pickerOpen ? (
                  <div className="responder-picker__panel" role="listbox" aria-label="בחירת כוננים">
                    <label className="search-field">
                      <Search size={20} strokeWidth={1.75} aria-hidden="true" />
                      <span className="visually-hidden">חיפוש כוננים</span>
                      <input
                        ref={assignSearchRef}
                        value={pickerQuery}
                        onChange={(event) => setPickerQuery(event.target.value)}
                        placeholder="חיפוש לפי שם או או״ק"
                      />
                    </label>
                    <ul className="responder-picker__list">
                      {pickerOptions.length === 0 ? (
                        <li className="responder-picker__empty t-caption text-muted">
                          {roster.length === 0
                            ? 'אין משתמשים פעילים להקצאה.'
                            : 'לא נמצאו כוננים להקצאה'}
                        </li>
                      ) : (
                        pickerOptions.map((person) => (
                          <li key={person.id}>
                            <button
                              type="button"
                              className="responder-picker__option"
                              onClick={() => assignResponder(person)}
                            >
                              <Avatar name={person.full_name} />
                              <span className="responder-picker__meta">
                                <span className="t-body-strong">{person.full_name}</span>
                                <span className="t-caption text-muted">
                                  או״ק{' '}
                                  <span className={monoClass(person.callsign)}>{person.callsign}</span>
                                </span>
                              </span>
                              <span className="responder-picker__add t-caption">הוספה</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>

              {draft.responders.length === 0 ? (
                <div className="assignment-empty">
                  <p className="t-body text-secondary">
                    בלי כונן משובץ האירוע נשאר טיוטה ואינו מוצג לכוננים.
                  </p>
                  {!pickerOpen ? (
                    <Button variant="ghost" onClick={openAssigner}>
                      התחלת הקצאה
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="stack-3">
                  {draft.responders.map((responder) => {
                    const treatedTotal = responder.treated.reduce((sum, row) => sum + row.quantity, 0)
                    return (
                      <li
                        key={responder.key}
                        data-responder-id={responder.responder_id}
                        className={[
                          'assignment-card',
                          responder.expanded ? 'assignment-card--open' : '',
                        ].join(' ')}
                      >
                        <div className="assignment-card__head">
                          <button
                            type="button"
                            className="assignment-card__toggle"
                            aria-expanded={responder.expanded}
                            onClick={() =>
                              updateResponder(responder.key, { expanded: !responder.expanded })
                            }
                          >
                            <Avatar name={responder.full_name} />
                            <span className="assignment-card__identity">
                              <span className="t-body-strong">{responder.full_name}</span>
                              <span className="t-caption text-muted">
                                או״ק{' '}
                                <span className={monoClass(responder.callsign)}>
                                  {responder.callsign}
                                </span>
                                {!responder.expanded ? (
                                  <>
                                    {' · '}
                                    {responder.start_time || responder.end_time
                                      ? `${responder.start_time || '—'}–${responder.end_time || '—'}`
                                      : 'ללא זמנים'}
                                    {' · '}
                                    {responder.total_km
                                      ? `${responder.total_km} ק״מ`
                                      : 'ללא ק״מ'}
                                    {' · '}
                                    {treatedTotal > 0
                                      ? `${treatedTotal} רכבים`
                                      : 'ללא רכבים'}
                                    {responder.emergency_means ? ' · אמצעים' : ''}
                                  </>
                                ) : null}
                              </span>
                            </span>
                            <ChevronDown
                              size={20}
                              strokeWidth={1.75}
                              className={
                                responder.expanded
                                  ? 'assignment-card__chevron is-rotated'
                                  : 'assignment-card__chevron'
                              }
                              aria-hidden="true"
                            />
                          </button>
                          <IconButton
                            label="הסרת כונן"
                            onClick={() => requestRemove(responder)}
                          >
                            <Trash2 size={20} strokeWidth={1.75} />
                          </IconButton>
                        </div>

                        {responder.expanded ? (
                          <div className="assignment-card__body">
                            <ResponderTimes
                              startTime={responder.start_time}
                              endTime={responder.end_time}
                              onChangeStart={(start_time) =>
                                updateResponder(responder.key, { start_time })
                              }
                              onChangeEnd={(end_time) =>
                                updateResponder(responder.key, { end_time })
                              }
                              onPersist={() => void persistLatest()}
                            />
                            <TextField
                              label="קילומטרים"
                              numeric
                              inputMode="decimal"
                              value={responder.total_km}
                              onChange={(event) =>
                                updateResponder(responder.key, { total_km: event.target.value })
                              }
                              onBlur={() => void persistLatest()}
                            />
                            <div className="assignment-card__treated">
                              <p className="t-label text-secondary">רכבים שטופלו</p>
                              <div className="assignment-card__steppers">
                                {lookups.vehicleKinds.map((kind) => {
                                  const quantity =
                                    responder.treated.find((row) => row.vehicle_kind_id === kind.id)
                                      ?.quantity ?? 0
                                  return (
                                    <CounterStepper
                                      key={kind.id}
                                      label={kind.name}
                                      value={quantity}
                                      onDelta={(delta) => bumpTreated(responder.key, kind.id, delta)}
                                    />
                                  )
                                })}
                              </div>
                              {lookups.vehicleKinds.length === 0 ? (
                                <p className="t-caption text-muted">
                                  אין סוגי רכב ברשימה הסגורה. הוסיפו פריטים במסך רשימות.
                                </p>
                              ) : null}
                            </div>
                            <Toggle
                              label="אמצעים"
                              checked={responder.emergency_means}
                              onChange={(checked) => {
                                updateResponder(responder.key, { emergency_means: checked })
                                queueMicrotask(() => void persistLatest())
                              }}
                            />
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <footer className="event-form__footer">
          <div className="event-form__footer-actions">
            <Button
              block
              loading={saving}
              loadingLabel="שומר…"
              onClick={() => void persistExplicit()}
            >
              שמירת אירוע
            </Button>
          </div>
        </footer>
      </div>

      <Dialog
        open={leaveConfirm}
        title="יציאה מהטופס"
        onClose={() => setLeaveConfirm(false)}
        footer={
          <>
            <Button
              variant="destructive"
              onClick={() => {
                setLeaveConfirm(false)
                onCancel()
              }}
            >
              יציאה בלי שמירה
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setLeaveConfirm(false)
                void leaveForm()
              }}
            >
              נסיון שמירה וחזרה
            </Button>
          </>
        }
      >
        <p className="t-body">השמירה האחרונה נכשלה. לצאת בכל זאת?</p>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        title="הסרת כונן"
        onClose={() => setRemoveTarget(null)}
        footer={
          <>
            <Button
              variant="destructive"
              onClick={() => {
                if (removeTarget) removeResponder(removeTarget.key)
              }}
            >
              הסרה
            </Button>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">להסיר את הכונן? הנתונים שמילא יימחקו.</p>
      </Dialog>

      <Dialog
        open={Boolean(overnightPrompt)}
        title="סיום ביום למחרת"
        onClose={() => setOvernightPrompt(null)}
        footer={
          <>
            <Button
              onClick={() => {
                const options = overnightPrompt?.options
                const current = draftRef.current
                if (current) {
                  for (const row of current.responders) {
                    if (isOvernightEnd(row.start_time, row.end_time)) {
                      overnightConfirmed.current.add(row.key)
                    }
                  }
                }
                setOvernightPrompt(null)
                void persistLatest({ ...options, overnightOk: true, revealErrors: true })
              }}
            >
              כן, מסתיים למחרת
            </Button>
            <Button variant="secondary" onClick={() => setOvernightPrompt(null)}>
              תיקון זמנים
            </Button>
          </>
        }
      >
        <p className="t-body">
          זמן הסיום מוקדם מזמן ההתחלה. האם האירוע מסתיים ביום למחרת?
        </p>
      </Dialog>
    </div>
  )
}

function ResponderTimes({
  startTime,
  endTime,
  onChangeStart,
  onChangeEnd,
  onPersist,
}: {
  startTime: string
  endTime: string
  onChangeStart: (value: string) => void
  onChangeEnd: (value: string) => void
  onPersist: () => void
}) {
  return (
    <div className="event-form__grid">
      <TimeField
        label="זמן התחלה"
        value={startTime}
        onChange={onChangeStart}
        onBlur={onPersist}
      />
      <TimeField label="זמן סיום" value={endTime} onChange={onChangeEnd} onBlur={onPersist} />
    </div>
  )
}
