import { useEffect, useState } from 'react'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  lastSavedByLabel,
  policeEventLabel,
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
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { shiftStamp } from '../lib/status'
import { EventFrozenMark } from '../components/events/EventFrozenMark'
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
    treated_count: event.treated?.length ?? 0,
  }
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
  const { show } = useToast()
  const [shift, setShift] = useState<ShiftDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
        if (active) setState('unavailable')
      })

    return () => {
      active = false
    }
  }, [shiftId])

  const backButton = (
    <div className="detail__back">
      <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
        משמרות
      </Button>
    </div>
  )

  if (state === 'unavailable') {
    return (
      <div>
        {backButton}
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין לך הרשאה לצפות במשמרת זו או שהמשמרת אינה קיימת."
          action={
            <Button variant="secondary" onClick={onBack}>
              חזרה למשמרות
            </Button>
          }
        />
      </div>
    )
  }

  if (state === 'loading' || !shift) {
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
  const bornEvents = shift.born_events ?? []
  const savedLabel = lastSavedByLabel(shift.last_saved?.full_name)

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
            {shift.responders.length} כוננים
            {' · '}
            {bornEvents.length} אירועים
            {savedLabel ? ` · ${savedLabel}` : ''}
          </p>
        </div>
        {/* The one rotated stamp in the system belongs on a record's own header. */}
        <StampChip {...shiftStamp(shiftRecordLogStatus(shift))} header />
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
            <h2 className="t-section">כוננים ({shift.responders.length})</h2>
            {shift.responders.length === 0 ? (
              <p className="t-body text-secondary">לא שובצו כוננים למשמרת זו.</p>
            ) : (
              <ul className="stack-3">
                {shift.responders.map((responder) => {
                  const name = responder.profile?.full_name ?? 'כונן'
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
                            <EventFrozenMark flags={event} />
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

      <Dialog
        open={confirmDelete}
        title="למחוק את המשמרת?"
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
      </Dialog>
    </div>
  )
}
