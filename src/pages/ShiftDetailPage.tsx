import { useEffect, useState } from 'react'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  canEditShiftByDate,
  fetchShiftDetail,
  SHIFT_KIND_LABELS,
  VEHICLE_TYPE_LABELS,
  type ShiftDetail,
} from '../lib/shifts'
import { deleteShift } from '../lib/shiftForm'
import { formatDate, formatNumber, formatPlate, monoClass } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

type ShiftDetailPageProps = {
  shiftId: string
  canManage: boolean
  isAdmin: boolean
  onBack: () => void
  onEdit: () => void
  onDeleted: () => void
}

function linkedEventLabel(row: ShiftDetail['linked_events'][number]): string {
  const event = row.event
  if (!event) return 'אירוע'
  const head = event.police_event_id
    ? `אירוע ${event.police_event_id}`
    : formatDate(event.event_date)
  const type = event.event_type?.name
  return type ? `${head} · ${type}` : head
}

export function ShiftDetailPage({
  shiftId,
  canManage,
  isAdmin,
  onBack,
  onEdit,
  onDeleted,
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
  const treatedCounts = shift.treated_vehicle_counts.filter((row) => row.count > 0)
  const cancelledCount = shift.linked_events.filter((row) => row.event?.is_cancelled).length

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
            {shift.linked_events.length} אירועים
          </p>
        </div>
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
              label='ק"מ התחלה'
              value={
                shift.odometer_start != null ? formatNumber(shift.odometer_start) : undefined
              }
              numeric
            />
            <LedgerRow
              label='ק"מ סיום'
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
            <h2 className="t-section">אירועים מקושרים ({shift.linked_events.length})</h2>
            {shift.linked_events.length === 0 ? (
              <p className="t-body text-secondary">אין אירועים מקושרים.</p>
            ) : (
              <Ledger>
                {shift.linked_events.map((row) => (
                  <LedgerRow
                    key={row.id}
                    label={linkedEventLabel(row)}
                    value={
                      row.event ? (
                        <span className="mono">{formatDate(row.event.event_date)}</span>
                      ) : undefined
                    }
                  />
                ))}
              </Ledger>
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
              {cancelledCount > 0 ? (
                <LedgerRow label="בוטל" value={`בוטל × ${cancelledCount}`} />
              ) : null}
              <LedgerRow
                label="רכבים שטופלו"
                value={
                  treatedCounts.length > 0
                    ? treatedCounts
                        .map((row) => `${row.vehicle_kind?.name ?? 'רכב'} × ${row.count}`)
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
