import { useEffect, useState } from 'react'
import { ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  deleteEvent,
  fetchEventDetail,
  type EventDetail,
  type EventResponderDetail,
} from '../lib/events'
import { mineFillCtaLabel, participationStamp, viewerStamp } from '../lib/status'
import {
  formatDate,
  formatEndTime,
  formatNumber,
  formatPlate,
  formatTime,
  monoClass,
} from '../lib/format'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Avatar } from '../components/ui/Avatar'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { OverflowMenu } from '../components/ui/OverflowMenu'
import { Skeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { useToast } from '../components/ui/Toast'

type EventDetailPageProps = {
  eventId: string
  onBack: () => void
  onEdit?: () => void
  onFillOwn?: () => void
  onEditLeadFields?: (responderId: string) => void
}

export function EventDetailPage({
  eventId,
  onBack,
  onEdit,
  onFillOwn,
  onEditLeadFields,
}: EventDetailPageProps) {
  const { user, roles } = useAuth()
  const { show } = useToast()
  const canEdit = Boolean(onEdit) && (roles.includes('admin') || roles.includes('shift_lead'))
  const canDelete = roles.includes('admin')
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    setState('loading')

    fetchEventDetail(eventId)
      .then((row) => {
        if (!active) return
        if (!row) {
          setState('unavailable')
          return
        }
        setEvent(row)
        setState('ready')
      })
      .catch(() => {
        if (active) setState('unavailable')
      })

    return () => {
      active = false
    }
  }, [eventId])

  const backButton = (
    <div className="detail__back">
      <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
        אירועים
      </Button>
    </div>
  )

  if (state === 'unavailable') {
    return (
      <div>
        {backButton}
        <EmptyState
          icon={<FileWarning size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים."
          action={
            <Button variant="secondary" onClick={onBack}>
              חזרה לאירועים
            </Button>
          }
        />
      </div>
    )
  }

  if (state === 'loading' || !event) {
    return (
      <div>
        {backButton}
        <div className="detail__grid" aria-busy="true" aria-label="טוען את פרטי האירוע">
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

  const mine = event.responders.find((row) => row.responder_id === user?.id)?.status ?? null
  const doneCount = event.responders.filter((row) => row.status === 'done').length
  const eventLabel = event.police_event_id ? `אירוע ${event.police_event_id}` : 'אירוע ללא מספר'
  const subLine = [
    formatDate(event.event_date),
    event.road?.name,
    event.location,
  ].filter(Boolean)

  async function confirmDeleteEvent() {
    setDeleting(true)
    const result = await deleteEvent(eventId)
    setDeleting(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    setConfirmDelete(false)
    show('האירוע נמחק', 'done')
    onBack()
  }

  return (
    <div>
      {backButton}

      <div className="detail__title-row">
        <div>
          <h1 className="t-title">{eventLabel}</h1>
          <p className="t-caption text-muted">{subLine.join(' · ')}</p>
        </div>
        <StampChip {...viewerStamp(event.status, mine)} header />
      </div>

      {canEdit || canDelete ? (
        <div className="detail__actions">
          {canEdit ? (
            <Button variant="secondary" onClick={onEdit}>
              עריכת אירוע
            </Button>
          ) : null}
          {canDelete ? (
            <OverflowMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              items={[
                {
                  label: 'מחיקה',
                  danger: true,
                  onSelect: () => setConfirmDelete(true),
                },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      <div className="detail__grid">
        <section className="card detail__aside stack-4">
          <h2 className="t-section">פרטי האירוע</h2>
          <Ledger>
            <LedgerRow
              label="אחמ״ש"
              value={
                event.shift_lead
                  ? `${event.shift_lead.full_name} · ${event.shift_lead.callsign}`
                  : undefined
              }
            />
            <LedgerRow label="תאריך" value={formatDate(event.event_date)} numeric />
            <LedgerRow label="מספר אירוע" value={event.police_event_id ?? undefined} numeric />
            <LedgerRow label="שלוחה" value={event.district?.name} />
            <LedgerRow label="או״ק ניידת" value={event.patrol_callsign ?? undefined} numeric />
            <LedgerRow label="סוג אירוע" value={event.event_type?.name} />
            <LedgerRow label="כביש" value={event.road?.name} />
            <LedgerRow label="מיקום" value={event.location ?? undefined} />
          </Ledger>
          {event.notes ? (
            <div className="detail__notes">
              <p className="t-label text-secondary">הערות</p>
              <p className="t-body">{event.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="stack-4">
          <div className="row-between">
            <h2 className="t-section">כוננים ({event.responders.length})</h2>
            <p className="t-caption text-muted">
              <span className="mono">
                {doneCount}/{event.responders.length}
              </span>{' '}
              הושלמו
            </p>
          </div>

          {event.responders.length === 0 ? (
            <p className="card t-body text-secondary">לא שובצו כוננים לאירוע זה.</p>
          ) : (
            event.responders.map((responder) => (
              <ResponderCard
                key={responder.id}
                responder={responder}
                eventDate={event.event_date}
                isViewer={responder.responder_id === user?.id}
                onFillOwn={
                  responder.responder_id === user?.id &&
                  responder.status !== 'done' &&
                  onFillOwn
                    ? onFillOwn
                    : undefined
                }
                fillLabel={
                  responder.responder_id === user?.id
                    ? (mineFillCtaLabel(responder.status) ?? undefined)
                    : undefined
                }
                onEditLeadFields={
                  onEditLeadFields
                    ? () => onEditLeadFields(responder.responder_id)
                    : undefined
                }
              />
            ))
          )}
        </section>
      </div>

      <Dialog
        open={confirmDelete}
        title={
          event.police_event_id
            ? `למחוק את האירוע ${event.police_event_id}?`
            : 'למחוק את האירוע?'
        }
        onClose={() => !deleting && setConfirmDelete(false)}
        footer={
          <>
            <Button
              variant="destructive"
              loading={deleting}
              loadingLabel="מוחק…"
              onClick={() => void confirmDeleteEvent()}
            >
              מחיקה
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">הפעולה תמחק גם את נתוני הכוננים המשויכים. לא ניתן לשחזר.</p>
      </Dialog>
    </div>
  )
}

function ResponderCard({
  responder,
  eventDate,
  isViewer,
  onFillOwn,
  fillLabel,
  onEditLeadFields,
}: {
  responder: EventResponderDetail
  eventDate: string
  isViewer: boolean
  onFillOwn?: () => void
  fillLabel?: string
  onEditLeadFields?: () => void
}) {
  const name = responder.profile?.full_name ?? 'כונן'
  const treated = responder.treated
    .map((row) => `${row.kind?.name ?? 'רכב'} × ${row.quantity}`)
    .join(', ')

  return (
    <article className="card stack-3">
      <header className="responder-card__head">
        <Avatar name={name} size="sm" />
        <span className="responder-card__identity">
          <span className="t-body-strong">{name}</span>
          <span className="t-caption text-muted" style={{ display: 'block' }}>
            או״ק{' '}
            <span className={monoClass(responder.profile?.callsign)}>
              {responder.profile?.callsign ?? '—'}
            </span>
          </span>
        </span>
        <StampChip {...participationStamp(responder.status, isViewer)} />
      </header>

      <Ledger>
        <LedgerRow label="זמן התחלה" value={formatTime(responder.started_at)} numeric />
        <LedgerRow
          label="זמן סיום"
          value={formatEndTime(responder.ended_at, eventDate)}
          numeric
        />
        <LedgerRow
          label="קילומטרים"
          value={
            responder.total_km != null ? (
              <>
                <span className="mono">{formatNumber(responder.total_km)}</span> ק״מ
              </>
            ) : undefined
          }
        />
        <LedgerRow label="אמצעים" value={responder.emergency_means ? 'כן' : 'לא'} />
        <LedgerRow label="רכבים שטופלו" value={treated || undefined} />
        <LedgerRow
          label="לוחית רישוי"
          value={responder.vehicle_plate ? formatPlate(responder.vehicle_plate) : undefined}
          numeric
          isolate
        />
        <LedgerRow
          label="קמ התחלה"
          value={responder.odometer_start != null ? formatNumber(responder.odometer_start) : undefined}
          numeric
        />
        <LedgerRow
          label="קמ סיום"
          value={responder.odometer_end != null ? formatNumber(responder.odometer_end) : undefined}
          numeric
        />
        <LedgerRow label="נתיב נסיעה" value={responder.route ?? undefined} />
      </Ledger>

      {responder.treatment_detail ? (
        <div className="detail__notes">
          <p className="t-label text-secondary">פירוט הטיפול</p>
          <p className="t-body">{responder.treatment_detail}</p>
        </div>
      ) : null}

      {responder.treatment_notes ? (
        <div className="detail__notes">
          <p className="t-label text-secondary">הערות לטיפול</p>
          <p className="t-body">{responder.treatment_notes}</p>
        </div>
      ) : null}

      {onFillOwn && fillLabel ? (
        <Button block onClick={onFillOwn}>
          {fillLabel}
        </Button>
      ) : null}
      {onEditLeadFields ? (
        <Button variant="ghost" onClick={onEditLeadFields}>
          עריכת שדות אחמ״ש
        </Button>
      ) : null}
    </article>
  )
}
