import { useEffect, useState } from 'react'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { listShiftEvents } from '../lib/shiftListEvents'
import {
  lastSavedByLabel,
  policeEventLabel,
  SHIFT_BORN_TYPE_MARK,
  shiftBornFillStamp,
} from '../lib/shiftBornEvents'
import {
  canEditShiftByDate,
  fetchShiftDetail,
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  type ShiftBornEventSummary,
  type ShiftDetail,
} from '../lib/shifts'
import { deleteShift } from '../lib/shiftForm'
import { shiftRecordLogStatus } from '../lib/shiftLogStatus'
import { formatDate, formatNumber, formatPlate, monoClass } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { AlertDialog } from '../components/ui/AlertDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { crewCanEdit, shiftWindowPhase, type ShiftPhase } from '../lib/shiftWindow'
import { canDeleteShiftEvent } from '../lib/currentShift'
import { isShiftBornEventEmpty } from '../lib/shiftBornEvents'
import { supabase } from '../lib/supabase'
import { NewShiftEventSheet } from '../components/shifts/NewShiftEventSheet'
import { shiftStamp } from '../lib/status'
import { EventFrozenMark } from '../components/events/EventFrozenMark'
import { useFreezeViewer } from '../lib/freezeViewer'
import { useToast } from '../components/ui/Toast'

type ShiftDetailPageProps = {
  shiftId: string
  canManage: boolean
  isAdmin: boolean
  onBack: () => void
  onEdit: () => void
  onDeleted: () => void
  onOpenEvent?: (eventId: string) => void
}

function bornSnapshot(event: ShiftBornEventSummary) {
  return {
    status: event.status,
    police_event_id: event.police_event_id,
    treatment_detail: event.treatment_detail,
    treatment_notes: event.treatment_notes,
    road_id: event.road_id,
    location: event.location,
    emergency_means: event.emergency_means,
    treated_count: event.treated?.length ?? 0,
  }
}

const ISRAEL_TIME_FORMAT = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function israelTime(iso: string): string {
  return ISRAEL_TIME_FORMAT.format(new Date(iso))
}

function timeLeftLabel(endsAt: string, now: Date): string {
  const minutes = Math.max(0, Math.round((new Date(endsAt).getTime() - now.getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  return `נותרו ${hours}:${String(minutes % 60).padStart(2, '0')} שעות`
}

function liveStamp(shift: ShiftDetail, phase: ShiftPhase) {
  if (phase === 'active') return { label: 'במשמרת', tone: 'pending' as const }
  return shiftStamp(shiftRecordLogStatus(shift), phase)
}

type LiveShiftScreenProps = {
  shift: ShiftDetail
  phase: ShiftPhase
  bornEvents: ShiftBornEventSummary[]
  canManage: boolean
  canCreateEvent: boolean
  freezeViewer: ReturnType<typeof useFreezeViewer>
  onNewEvent: () => void
  onOpenEvent?: (eventId: string) => void
  onAskDelete: (eventId: string) => void
}

function LiveShiftScreen({
  shift,
  phase,
  bornEvents,
  canManage,
  canCreateEvent,
  freezeViewer,
  onNewEvent,
  onOpenEvent,
  onAskDelete,
}: LiveShiftScreenProps) {
  const now = new Date()
  const kindLabel = SHIFT_KIND_LABELS[shift.shift_kind]
  const hours = `${israelTime(shift.starts_at!)}–${israelTime(shift.ends_at!)}`
  const newestFirst = [...bornEvents].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )

  return (
    <div className="stack-4">
      <div className="detail__title-row">
        <div>
          <h1 className="t-title">{kindLabel}</h1>
          <p className="t-caption text-muted">
            <span className="mono">{formatDate(shift.shift_date)}</span>
            {' · '}
            <span className="mono">{hours}</span>
            {' · '}
            {VEHICLE_TYPE_LABELS[shift.vehicle_type]}
          </p>
          {phase === 'active' && shift.ends_at ? (
            <p className="t-caption text-muted">{timeLeftLabel(shift.ends_at, now)}</p>
          ) : null}
        </div>
        <StampChip {...liveStamp(shift, phase)} header />
      </div>

      {canCreateEvent ? (
        <Button block onClick={onNewEvent}>
          אירוע חדש
        </Button>
      ) : null}

      <div className="card stack-3">
        <h2 className="t-section">אירועי המשמרת ({newestFirst.length})</h2>
        {newestFirst.length === 0 ? (
          <p className="t-body text-secondary">עוד לא נפתחו אירועים במשמרת.</p>
        ) : (
          <ul className="stack-3">
            {newestFirst.map((event) => {
              const snapshot = bornSnapshot(event)
              const isEmpty = isShiftBornEventEmpty(snapshot)
              const mayDelete =
                isEmpty &&
                canDeleteShiftEvent({
                  canManage,
                  phase,
                  empty: isEmpty,
                  done: event.status === 'done',
                })
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className="event-card"
                    onClick={() => onOpenEvent?.(event.id)}
                  >
                    <span className="event-card__top">
                      <span className="event-card__type">
                        <EventFrozenMark event={event} viewer={freezeViewer} />
                        <span className="t-body-strong">
                          {event.event_type?.name ?? 'אירוע'} {SHIFT_BORN_TYPE_MARK}
                        </span>
                      </span>
                      <StampChip {...shiftBornFillStamp(snapshot)} />
                    </span>
                    <span className="t-caption text-muted">
                      {policeEventLabel(event.police_event_id)}
                      {event.location ? ` · ${event.location}` : ''}
                      {event.created_at ? ` · נפתח ב-${israelTime(event.created_at)}` : ''}
                    </span>
                  </button>
                  {mayDelete ? (
                    <Button variant="ghost" onClick={() => onAskDelete(event.id)}>
                      מחיקה
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="card stack-3">
        <h2 className="t-section">מתנדבים ({shift.responders.length})</h2>
        <ul className="stack-3">
          {shift.responders.map((responder) => {
            const name = responder.profile?.full_name ?? 'מתנדב'
            return (
              <li key={responder.id} className="responder-card__head">
                <Avatar name={name} size="sm" />
                <span className="t-body-strong">{name}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function ShiftDetailPage({
  shiftId,
  canManage,
  isAdmin,
  onBack,
  onEdit,
  onDeleted,
  onOpenEvent,
}: ShiftDetailPageProps) {
  const { user } = useAuth()
  const freezeViewer = useFreezeViewer()
  const { show } = useToast()
  const [shift, setShift] = useState<ShiftDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const [newEventOpen, setNewEventOpen] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<string | null>(null)
  const [eventDeleteError, setEventDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setState('loading')

    fetchShiftDetail(shiftId)
      .then((row) => {
        if (!active) return
        if (!row) {
          setState('unavailable')
          return
        }
        setShift(row)
        setState('ready')
      })
      .catch(() => {
        if (active) setState('error')
      })

    return () => {
      active = false
    }
  }, [shiftId, reloadCount])

  const backButton = (
    <div className="detail__back">
      <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
        משמרות
      </Button>
    </div>
  )

  if (state === 'unavailable' || state === 'error') {
    return (
      <div>
        {backButton}
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title={
            state === 'error'
              ? 'טעינת המשמרת נכשלה. בדקו את החיבור ונסו שוב.'
              : 'אין לך הרשאה לצפות במשמרת זו או שהמשמרת אינה קיימת.'
          }
          action={
            <Button variant="secondary" onClick={onBack}>
              חזרה למשמרות
            </Button>
          }
        />
      </div>
    )
  }

  const showingAnotherShift = shift !== null && shift.id !== shiftId
  if (!shift || showingAnotherShift) {
    return (
      <div>
        {backButton}
        <div className="detail__grid" aria-busy="true" aria-label="טוען את פרטי המשמרת">
          <div className="card stack-3">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} height={24} />
            ))}
          </div>
          <div className="stack-4">
            <div className="card stack-3">
              <Skeleton height={32} width="60%" />
              <Skeleton height={24} />
              <Skeleton height={24} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const kindLabel = SHIFT_KIND_LABELS[shift.shift_kind]
  const vehicleLabel = VEHICLE_TYPE_LABELS[shift.vehicle_type]
  const plate =
    shift.vehicle_type === 'personal' && shift.personal_vehicle?.plate_number
      ? formatPlate(shift.personal_vehicle.plate_number)
      : null
  const title = plate ? `${kindLabel} · ${vehicleLabel} · ${plate}` : `${kindLabel} · ${vehicleLabel}`

  const viewerAssigned = Boolean(
    user && shift.responders.some((row) => row.responder_id === user.id),
  )
  const canEdit =
    canManage || (viewerAssigned && canEditShiftByDate(shift.shift_date))

  const eventTypeCounts = shift.event_type_counts.filter((row) => row.count > 0)
  const bornEvents = listShiftEvents(shift.born_events)
  const savedLabel = lastSavedByLabel(shift.last_saved?.full_name)

  const phase = shiftWindowPhase(shift, new Date())
  const isLive = crewCanEdit(phase)
  const canCreateEvent = canManage || isAdmin || (viewerAssigned && crewCanEdit(phase))

  async function confirmDeleteShiftEvent() {
    if (!eventToDelete) return
    setDeleting(true)
    setEventDeleteError(null)
    const { error } = await supabase.rpc('delete_empty_shift_event', { p_event_id: eventToDelete })
    setDeleting(false)
    if (error) {
      setEventDeleteError(error.message)
      return
    }
    setEventToDelete(null)
    setReloadCount((count) => count + 1)
  }

  async function confirmDeleteShift() {
    setDeleting(true)
    const result = await deleteShift(shiftId)
    setDeleting(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    setConfirmDelete(false)
    show('המשמרת נמחקה', 'done')
    onDeleted()
  }

  if (isLive) {
    return (
      <div>
        {backButton}
        <LiveShiftScreen
          shift={shift}
          phase={phase}
          bornEvents={bornEvents}
          canManage={canManage || isAdmin}
          canCreateEvent={canCreateEvent}
          freezeViewer={freezeViewer}
          onNewEvent={() => setNewEventOpen(true)}
          onOpenEvent={onOpenEvent}
          onAskDelete={(eventId) => {
            setEventDeleteError(null)
            setEventToDelete(eventId)
          }}
        />
        <NewShiftEventSheet
          open={newEventOpen}
          shiftId={shiftId}
          onClose={() => setNewEventOpen(false)}
          onCreated={(eventId) => {
            setNewEventOpen(false)
            onOpenEvent?.(eventId)
          }}
        />
        <AlertDialog
          open={eventToDelete !== null}
          status="danger"
          title="למחוק את האירוע?"
          busy={deleting}
          onClose={() => !deleting && setEventToDelete(null)}
          footer={
            <>
              <Button
                variant="destructive"
                loading={deleting}
                loadingLabel="מוחק…"
                onClick={() => void confirmDeleteShiftEvent()}
              >
                מחיקה
              </Button>
              <Button variant="secondary" disabled={deleting} onClick={() => setEventToDelete(null)}>
                ביטול
              </Button>
            </>
          }
        >
          <p className="t-body">האירוע עוד ריק, ולכן אפשר למחוק אותו.</p>
          {eventDeleteError ? (
            <p className="t-body" role="alert">
              {eventDeleteError}
            </p>
          ) : null}
        </AlertDialog>
      </div>
    )
  }

  return (
    <div>
      {backButton}

      <div className="detail__title-row">
        <div>
          <h1 className="t-title">
            {plate ? (
              <>
                {kindLabel} · {vehicleLabel} · <span className={monoClass(plate)}>{plate}</span>
              </>
            ) : (
              title
            )}
          </h1>
          <p className="t-caption text-muted">
            <span className="mono">{formatDate(shift.shift_date)}</span>
            {' · '}
            {shift.responders.length} מתנדבים
            {' · '}
            {bornEvents.length} אירועים
            {savedLabel ? ` · ${savedLabel}` : ''}
          </p>
        </div>
        {/* The one rotated stamp in the system belongs on a record's own header. */}
        <StampChip {...shiftStamp(shiftRecordLogStatus(shift), shiftWindowPhase(shift, new Date()))} header />
      </div>

      {canEdit || isAdmin ? (
        <div className="detail__actions">
          {canEdit ? (
            <Button variant="secondary" onClick={onEdit}>
              עריכה
            </Button>
          ) : null}
          {isAdmin ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              מחיקה
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="detail__grid">
        <section className="card detail__aside stack-4">
          <h2 className="t-section">פרטי המשמרת</h2>
          <Ledger>
            <LedgerRow
              label="אחמ״ש"
              value={
                shift.shift_lead
                  ? `${shift.shift_lead.full_name} · ${shift.shift_lead.callsign}`
                  : undefined
              }
            />
            <LedgerRow label="תאריך" value={formatDate(shift.shift_date)} numeric />
            <LedgerRow label="שם משמרת" value={kindLabel} />
            <LedgerRow label="סוג רכב" value={vehicleLabel} />
            {shift.vehicle_type === 'personal' ? (
              <LedgerRow label="לוחית" value={plate ?? undefined} numeric isolate />
            ) : null}
            <LedgerRow
              label='מד אוץ התחלה'
              value={
                shift.odometer_start != null ? formatNumber(shift.odometer_start) : undefined
              }
              numeric
            />
            <LedgerRow
              label='מד אוץ סיום'
              value={shift.odometer_end != null ? formatNumber(shift.odometer_end) : undefined}
              numeric
            />
            <LedgerRow
              label="קילומטרים"
              value={
                shift.total_km != null ? (
                  <>
                    <span className="mono">{formatNumber(shift.total_km)}</span> ק״מ
                  </>
                ) : undefined
              }
            />
          </Ledger>
          {shift.notes ? (
            <div className="detail__notes">
              <p className="t-label text-secondary">הערות כלליות</p>
              <p className="t-body">{shift.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="stack-4">
          <div className="card stack-3">
            <h2 className="t-section">מתנדבים ({shift.responders.length})</h2>
            {shift.responders.length === 0 ? (
              <p className="t-body text-secondary">לא שובצו מתנדבים למשמרת זו.</p>
            ) : (
              <ul className="stack-3">
                {shift.responders.map((responder) => {
                  const name = responder.profile?.full_name ?? 'מתנדב'
                  const callsign = responder.profile?.callsign ?? '—'
                  return (
                    <li key={responder.id} className="responder-card__head">
                      <Avatar name={name} size="sm" />
                      <span className="responder-card__identity">
                        <span className="t-body-strong">{name}</span>
                        <span className="t-caption text-muted" style={{ display: 'block' }}>
                          או״ק <span className={monoClass(callsign)}>{callsign}</span>
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="card stack-3">
            <h2 className="t-section">אירועים ממשמרת ({bornEvents.length})</h2>
            {bornEvents.length === 0 ? (
              <p className="t-body text-secondary">אין אירועים ממשמרת זו.</p>
            ) : (
              <ul className="stack-3">
                {bornEvents.map((event) => {
                  const stamp = shiftBornFillStamp(bornSnapshot(event))
                  const savedBy = lastSavedByLabel(event.last_saved?.full_name)
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="event-card"
                        onClick={() => onOpenEvent?.(event.id)}
                      >
                        <span className="event-card__top">
                          <span className="event-card__type">
                            <EventFrozenMark event={event} viewer={freezeViewer} />
                            <span className="t-body-strong">
                              {event.event_type?.name ?? 'אירוע'}
                            </span>
                          </span>
                          <StampChip {...stamp} />
                        </span>
                        <span className="t-caption text-muted">
                          {policeEventLabel(event.police_event_id)}
                          {savedBy ? ` · ${savedBy}` : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="card stack-3">
            <h2 className="t-section">סיכום אירועים</h2>
            <Ledger>
              <LedgerRow
                label="מספר אירועים לפי סוג"
                value={
                  eventTypeCounts.length > 0
                    ? eventTypeCounts
                        .map((row) => `${row.event_type?.name ?? 'סוג'} × ${row.count}`)
                        .join(', ')
                    : '—'
                }
              />
            </Ledger>
          </div>
        </section>
      </div>

      <AlertDialog
        open={confirmDelete}
        status="danger"
        title="למחוק את המשמרת?"
        busy={deleting}
        onClose={() => !deleting && setConfirmDelete(false)}
        footer={
          <>
            <Button
              variant="destructive"
              loading={deleting}
              loadingLabel="מוחק…"
              onClick={() => void confirmDeleteShift()}
            >
              מחיקה
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">הפעולה תמחק את המשמרת ואת הנתונים המשויכים אליה. לא ניתן לשחזר.</p>
      </AlertDialog>
    </div>
  )
}
