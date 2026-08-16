import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronRight, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { fieldsMatchQuery } from '../lib/searchQuery'
import {
  fetchAssignableUsers,
  fetchEventLookups,
  todayJerusalem,
  type AssignableUser,
  type LookupOption,
} from '../lib/eventForm'
import {
  computeTotalKm,
  saveShiftForm,
  SHIFT_CREW_ERROR,
  validateShiftSave,
  type ShiftFormDraft,
  type ShiftSaveError,
} from '../lib/shiftForm'
import { lastSavedByLabel } from '../lib/shiftBornEvents'
import {
  canEditShiftByDate,
  fetchShiftDetail,
  SHIFT_KIND_OPTIONS,
  VEHICLE_TYPE_LABELS,
  type ShiftKind,
  type ShiftVehicleType,
} from '../lib/shifts'
import { digitsOnly, formatPlate, monoClass } from '../lib/format'
import { captureEvent } from '../lib/posthog'
import { supabase } from '../lib/supabase'
import { Avatar } from '../components/ui/Avatar'
import { Button, IconButton } from '../components/ui/Button'
import { CounterStepper } from '../components/ui/CounterStepper'
import { EmptyState } from '../components/ui/EmptyState'
import { FormStickyFooter } from '../components/ui/FormStickyFooter'
import { SelectField } from '../components/ui/SelectField'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

type ShiftFormPageProps = {
  shiftId?: string
  onBack: () => void
  onSaved: (shiftId: string) => void
}

type PersonalVehicleOption = {
  id: string
  user_id: string
  plate_number: string
  model: string
}

type FieldErrors = Partial<Record<ShiftSaveError['field'], string>> & { form?: string }

type LoadState = 'loading' | 'ready' | 'denied' | 'too_early'

const VEHICLE_OPTIONS: { value: ShiftVehicleType; label: string }[] = [
  { value: 'patrol_north', label: VEHICLE_TYPE_LABELS.patrol_north },
  { value: 'patrol_center', label: VEHICLE_TYPE_LABELS.patrol_center },
  { value: 'personal', label: VEHICLE_TYPE_LABELS.personal },
]

function emptyDraft(): ShiftFormDraft {
  return {
    shift_date: todayJerusalem(),
    shift_kind: 'morning',
    vehicle_type: 'patrol_north',
    personal_vehicle_id: null,
    responder_ids: [],
    event_ids: [],
    odometer_start: null,
    odometer_end: null,
    total_km: null,
    notes: '',
    event_type_counts: [],
    treated_vehicle_counts: [],
    cancelled_count: 0,
  }
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function numberToInput(value: number | null): string {
  return value == null ? '' : String(value)
}

function fieldErrorsFrom(list?: Array<{ field: string; message: string }>): FieldErrors {
  if (!list?.length) return {}
  const next: FieldErrors = {}
  for (const row of list) next[row.field as keyof FieldErrors] = row.message
  return next
}

async function fetchVehiclesForResponders(
  responderIds: string[],
): Promise<PersonalVehicleOption[]> {
  if (responderIds.length === 0) return []
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, user_id, plate_number, model')
    .in('user_id', responderIds)
    .eq('archived', false)
    .order('plate_number', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as PersonalVehicleOption[]
}

export function ShiftFormPage({ shiftId, onBack, onSaved }: ShiftFormPageProps) {
  const { user, roles } = useAuth()
  const { show } = useToast()
  const canManageLead = roles.includes('admin') || roles.includes('shift_lead')
  const assignSearchRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<ShiftFormDraft | null>(null)
  const [roster, setRoster] = useState<AssignableUser[]>([])
  const [assignedProfiles, setAssignedProfiles] = useState<
    Map<string, { full_name: string; callsign: string }>
  >(new Map())
  const [eventTypes, setEventTypes] = useState<LookupOption[]>([])
  const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicleOption[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [lastSavedName, setLastSavedName] = useState<string | null>(null)

  const draftRef = useRef<ShiftFormDraft | null>(null)
  const canEditResponders = canManageLead

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    if (!user) {
      setLoadState('denied')
      return
    }

    // Create: lead/admin only
    if (!shiftId && !canManageLead) {
      setLoadState('denied')
      return
    }

    let active = true
    setLoadState('loading')

    const lookupsPromise = canManageLead
      ? Promise.all([fetchAssignableUsers(), fetchEventLookups()])
      : Promise.all([Promise.resolve([] as AssignableUser[]), fetchEventLookups()])

    Promise.all([lookupsPromise, shiftId ? fetchShiftDetail(shiftId) : Promise.resolve(null)])
      .then(async ([[nextRoster, lookups], existing]) => {
        if (!active) return

        if (shiftId && !existing) {
          setLoadState('denied')
          return
        }

        if (existing && !canManageLead) {
          const assigned = existing.responders.some((row) => row.responder_id === user.id)
          if (!assigned) {
            setLoadState('denied')
            return
          }
          if (!canEditShiftByDate(existing.shift_date)) {
            setLoadState('too_early')
            return
          }
        }

        setRoster(nextRoster)
        setEventTypes(lookups.eventTypes)

        if (existing) {
          const profiles = new Map<string, { full_name: string; callsign: string }>()
          for (const row of existing.responders) {
            if (row.profile) {
              profiles.set(row.responder_id, {
                full_name: row.profile.full_name,
                callsign: row.profile.callsign,
              })
            }
          }
          setAssignedProfiles(profiles)

          const nextDraft: ShiftFormDraft = {
            id: existing.id,
            shift_date: existing.shift_date,
            shift_kind: existing.shift_kind,
            vehicle_type: existing.vehicle_type,
            personal_vehicle_id: existing.personal_vehicle_id,
            responder_ids: existing.responders.map((row) => row.responder_id),
            event_ids: existing.linked_events.map((row) => row.event_id),
            odometer_start: existing.odometer_start,
            odometer_end: existing.odometer_end,
            total_km: existing.total_km,
            notes: existing.notes ?? '',
            event_type_counts: existing.event_type_counts.map((row) => ({
              event_type_id: row.event_type_id,
              count: row.count,
            })),
            treated_vehicle_counts: [],
            cancelled_count: 0,
            expected_updated_at: existing.updated_at,
          }
          draftRef.current = nextDraft
          setDraft(nextDraft)
          setLastSavedName(existing.last_saved?.full_name ?? null)
        } else {
          const nextDraft = emptyDraft()
          draftRef.current = nextDraft
          setDraft(nextDraft)
          setAssignedProfiles(new Map())
          setLastSavedName(null)
        }

        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('denied')
      })

    return () => {
      active = false
    }
  }, [canManageLead, shiftId, user])

  useEffect(() => {
    if (!draft) return
    let active = true
    fetchVehiclesForResponders(draft.responder_ids)
      .then((rows) => {
        if (!active) return
        setPersonalVehicles(rows)
        const keep = new Set(rows.map((row) => row.id))
        if (
          draft.personal_vehicle_id &&
          draft.vehicle_type === 'personal' &&
          !keep.has(draft.personal_vehicle_id)
        ) {
          updateDraft({ personal_vehicle_id: null })
        }
      })
      .catch(() => {
        if (active) setPersonalVehicles([])
      })
    return () => {
      active = false
    }
    // Only refetch when crew changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.responder_ids.join('|')])

  const pickerOptions = useMemo(() => {
    if (!draft) return []
    const taken = new Set(draft.responder_ids)
    const needle = pickerQuery.trim()
    return roster.filter((person) => {
      if (taken.has(person.id)) return false
      if (!needle) return true
      return fieldsMatchQuery([person.full_name, person.callsign], needle)
    })
  }, [draft, roster, pickerQuery])

  const assignedPeople = useMemo(() => {
    if (!draft) return []
    return draft.responder_ids.map((id) => {
      const person = roster.find((row) => row.id === id)
      if (person) return person
      const profile = assignedProfiles.get(id)
      return {
        id,
        full_name: profile?.full_name ?? 'כונן',
        callsign: profile?.callsign ?? '—',
      }
    })
  }, [draft, roster, assignedProfiles])

  const computedKm = draft
    ? computeTotalKm(draft.odometer_start, draft.odometer_end)
    : null

  function updateDraft(patch: Partial<ShiftFormDraft>) {
    setDraft((current) => {
      if (!current) return current
      const next = { ...current, ...patch }
      draftRef.current = next
      return next
    })
    if (errors.form) setErrors((current) => ({ ...current, form: undefined }))
  }

  function bumpTypeCount(eventTypeId: string, delta: number) {
    setDraft((current) => {
      if (!current) return current
      const prev =
        current.event_type_counts.find((row) => row.event_type_id === eventTypeId)?.count ?? 0
      const count = Math.min(99, Math.max(0, prev + delta))
      const others = current.event_type_counts.filter((row) => row.event_type_id !== eventTypeId)
      const next: ShiftFormDraft = {
        ...current,
        event_type_counts: [...others, { event_type_id: eventTypeId, count }],
      }
      draftRef.current = next
      return next
    })
  }

  function typeCountValue(eventTypeId: string): number {
    return draft?.event_type_counts.find((row) => row.event_type_id === eventTypeId)?.count ?? 0
  }

  function openAssigner() {
    setPickerOpen(true)
    queueMicrotask(() => assignSearchRef.current?.focus())
  }

  function assignResponder(person: AssignableUser) {
    if (!draft || !canEditResponders) return
    if (draft.responder_ids.includes(person.id)) return
    if (draft.responder_ids.length >= 3) {
      show(SHIFT_CREW_ERROR, 'alert')
      return
    }
    setAssignedProfiles((current) => {
      const next = new Map(current)
      next.set(person.id, { full_name: person.full_name, callsign: person.callsign })
      return next
    })
    updateDraft({ responder_ids: [...draft.responder_ids, person.id] })
    setPickerQuery('')
    setPickerOpen(false)
    setErrors((current) => ({ ...current, responder_ids: undefined }))
  }

  function removeResponder(responderId: string) {
    if (!draft || !canEditResponders) return
    updateDraft({
      responder_ids: draft.responder_ids.filter((id) => id !== responderId),
    })
    setErrors((current) => ({ ...current, responder_ids: undefined }))
  }

  async function handleSave() {
    const current = draftRef.current
    if (!current || !user) return

    const fieldErrors = validateShiftSave(current)
    if (fieldErrors.length > 0) {
      const crewInvalid = fieldErrors.some((row) => row.field === 'responder_ids')
      setErrors({
        ...fieldErrorsFrom(fieldErrors),
        form: crewInvalid
          ? SHIFT_CREW_ERROR
          : 'יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.',
      })
      show(fieldErrors[0]?.message ?? 'לא ניתן לשמור את המשמרת', 'alert')
      return
    }

    setSaving(true)
    setErrors({})
    const result = await saveShiftForm(current, user.id, {
      syncResponders: canManageLead,
      canEditIdentity: canManageLead,
    })
    setSaving(false)
    if (!result.ok) {
      setErrors({ ...fieldErrorsFrom(result.fieldErrors), form: result.error })
      show(result.error, 'alert')
      return
    }
    const nextDraft = {
      ...current,
      id: result.shiftId,
      total_km: computeTotalKm(current.odometer_start, current.odometer_end),
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    captureEvent('shift_saved', {
      shift_id: result.shiftId,
      is_new: !current.id,
    })
    show('המשמרת נשמרה', 'done')
    onSaved(result.shiftId)
  }

  if (loadState === 'too_early') {
    return (
      <EmptyState
        icon={<Calendar size={40} strokeWidth={1.75} />}
        title="ניתן לערוך החל מתאריך המשמרת"
        action={
          <Button variant="secondary" onClick={onBack}>
            חזרה
          </Button>
        }
      />
    )
  }

  if (loadState === 'denied') {
    return (
      <EmptyState
        icon={<UserRound size={40} strokeWidth={1.75} />}
        title="אין לך הרשאה לפעולה זו."
        action={
          <Button variant="secondary" onClick={onBack}>
            חזרה
          </Button>
        }
      />
    )
  }

  if (loadState === 'loading' || !draft) {
    return <EventListSkeleton count={4} />
  }

  const isEdit = Boolean(draft.id)
  const title = isEdit ? 'עריכת משמרת' : 'משמרת חדשה'

  return (
    <div className="event-form">
      <div className="event-form__panel" data-theme="field">
        <header className="event-form__head">
          <button type="button" className="event-form__back" onClick={onBack}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>חזרה</span>
          </button>

          <div className="event-form__title-row">
            <div className="event-form__title-block">
              <h1 className="t-title">{title}</h1>
              {errors.form ? (
                <p className="t-caption field__hint--error" aria-live="polite">
                  {errors.form}
                </p>
              ) : (
                <p className="t-caption text-muted">
                  {lastSavedByLabel(lastSavedName) ?? 'מילוי יומן משמרת וסיכום אירועים.'}
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="event-form__sections">
          <section className="form-section">
            <h2 className="form-section__heading">
              <span className="form-section__counter">חלק א׳</span>
              <span>פרטי המשמרת</span>
            </h2>
            <div className="form-section__fields">
              <div className="event-form__grid">
                <TextField
                  label="תאריך"
                  type="date"
                  required
                  disabled={!canManageLead}
                  value={draft.shift_date}
                  error={errors.shift_date}
                  onChange={(event) => {
                    updateDraft({ shift_date: event.target.value })
                    setErrors((current) => ({ ...current, shift_date: undefined }))
                  }}
                  affix={
                    <span className="field__affix" aria-hidden="true">
                      <Calendar size={20} strokeWidth={1.75} />
                    </span>
                  }
                />

                <SelectField
                  label="שם משמרת"
                  required
                  disabled={!canManageLead}
                  value={draft.shift_kind}
                  error={errors.shift_kind}
                  options={SHIFT_KIND_OPTIONS}
                  onChange={(event) => {
                    updateDraft({ shift_kind: event.target.value as ShiftKind })
                    setErrors((current) => ({ ...current, shift_kind: undefined }))
                  }}
                />

                <SelectField
                  label="סוג רכב"
                  required
                  disabled={!canManageLead}
                  value={draft.vehicle_type}
                  error={errors.vehicle_type}
                  options={VEHICLE_OPTIONS}
                  onChange={(event) => {
                    const vehicle_type = event.target.value as ShiftVehicleType
                    updateDraft({
                      vehicle_type,
                      personal_vehicle_id:
                        vehicle_type === 'personal' ? draft.personal_vehicle_id : null,
                    })
                    setErrors((current) => ({
                      ...current,
                      vehicle_type: undefined,
                      personal_vehicle_id: undefined,
                    }))
                  }}
                />

                {draft.vehicle_type === 'personal' ? (
                  <SelectField
                    label="לוחית"
                    required
                    disabled={!canManageLead}
                    value={draft.personal_vehicle_id ?? ''}
                    error={errors.personal_vehicle_id}
                    placeholder={
                      draft.responder_ids.length === 0
                        ? 'יש לשבץ כוננים תחילה'
                        : personalVehicles.length === 0
                          ? 'אין לוחיות לרכב פרטי'
                          : 'בחירת לוחית'
                    }
                    options={personalVehicles.map((row) => ({
                      value: row.id,
                      label: `${formatPlate(row.plate_number)}${row.model ? ` · ${row.model}` : ''}`,
                    }))}
                    onChange={(event) => {
                      updateDraft({ personal_vehicle_id: event.target.value || null })
                      setErrors((current) => ({ ...current, personal_vehicle_id: undefined }))
                    }}
                  />
                ) : null}
              </div>
            </div>
          </section>

          <section className="form-section">
            <h2 className="form-section__heading">
              <span className="form-section__counter">חלק ב׳</span>
              <span>שיבוץ כוננים</span>
            </h2>
            <div className="form-section__fields">
              <div className="responder-assign">
                <div className="responder-assign__toolbar">
                  <p className="t-label text-secondary">
                    {assignedPeople.length === 0
                      ? 'טרם שובצו כוננים'
                      : `${assignedPeople.length} כוננים משובצים`}
                  </p>
                  {canEditResponders ? (
                    <Button
                      variant="secondary"
                      icon={<Plus size={20} strokeWidth={1.75} />}
                      onClick={() => (pickerOpen ? setPickerOpen(false) : openAssigner())}
                      aria-expanded={pickerOpen}
                    >
                      {pickerOpen ? 'סגירת שיבוץ' : 'שיבוץ כוננים'}
                    </Button>
                  ) : null}
                </div>

                {pickerOpen && canEditResponders ? (
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
                            ? 'אין משתמשים פעילים לשיבוץ.'
                            : 'לא נמצאו כוננים לשיבוץ'}
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
              {errors.responder_ids ? (
                <p className="t-caption field__hint--error">{errors.responder_ids}</p>
              ) : null}

              {assignedPeople.length === 0 ? (
                <div className="assignment-empty">
                  <p className="t-body text-secondary">
                    {canEditResponders
                      ? 'יש לשבץ כוננים למשמרת.'
                      : 'לא שובצו כוננים למשמרת זו.'}
                  </p>
                </div>
              ) : (
                <ul className="stack-3">
                  {assignedPeople.map((person) => (
                    <li key={person.id} className="assignment-card">
                      <div className="assignment-card__head">
                        <div className="assignment-card__toggle" style={{ cursor: 'default' }}>
                          <Avatar name={person.full_name} />
                          <span className="assignment-card__identity">
                            <span className="t-body-strong">{person.full_name}</span>
                            <span className="t-caption text-muted">
                              או״ק{' '}
                              <span className={monoClass(person.callsign)}>{person.callsign}</span>
                            </span>
                          </span>
                        </div>
                        {canEditResponders ? (
                          <IconButton label="הסרת כונן" onClick={() => removeResponder(person.id)}>
                            <Trash2 size={20} strokeWidth={1.75} />
                          </IconButton>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="form-section">
            <h2 className="form-section__heading">
              <span className="form-section__counter">חלק ג׳</span>
              <span>סיכום אירועים</span>
            </h2>
            <div className="form-section__fields stack-4">
              <div className="assignment-card__treated">
                <p className="t-label text-secondary">מספר אירועים לפי סוג</p>
                <div className="assignment-card__steppers">
                  {eventTypes.map((type) => (
                    <CounterStepper
                      key={type.id}
                      label={type.name}
                      value={typeCountValue(type.id)}
                      onDelta={(delta) => bumpTypeCount(type.id, delta)}
                    />
                  ))}
                </div>
                {eventTypes.length === 0 ? (
                  <p className="t-caption text-muted">אין סוגי אירוע ברשימה הסגורה.</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="form-section">
            <h2 className="form-section__heading">
              <span className="form-section__counter">חלק ד׳</span>
              <span>קילומטרים והערות</span>
            </h2>
            <div className="form-section__fields">
              <div className="event-form__grid">
                <TextField
                  label='מד אוץ התחלה'
                  numeric
                  inputMode="numeric"
                  value={numberToInput(draft.odometer_start)}
                  onChange={(event) => {
                    updateDraft({
                      odometer_start: parseOptionalNumber(digitsOnly(event.target.value)),
                    })
                  }}
                />
                <TextField
                  label='מד אוץ סיום'
                  numeric
                  inputMode="numeric"
                  value={numberToInput(draft.odometer_end)}
                  onChange={(event) => {
                    updateDraft({
                      odometer_end: parseOptionalNumber(digitsOnly(event.target.value)),
                    })
                  }}
                />
                <TextField
                  label="קילומטרים"
                  numeric
                  inputMode="numeric"
                  disabled
                  value={numberToInput(computedKm)}
                  onChange={() => undefined}
                />
              </div>
              <TextAreaField
                label="הערות כלליות"
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
              />
            </div>
          </section>
        </div>

        <FormStickyFooter>
          <div className="event-form__footer-actions">
            <Button block loading={saving} loadingLabel="שומר…" onClick={() => void handleSave()}>
              שמירה
            </Button>
          </div>
        </FormStickyFooter>
      </div>
    </div>
  )
}
