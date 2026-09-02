import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  deleteEvent,
  viewerMayDeleteOthersEvents,
  fetchEventDetail,
  type EventDetail,
  type EventResponderDetail,
} from '../lib/events'
import { responderCardShowsOdometers, responderCardStartsOpen } from '../lib/responderCard'
import { eventGeocodeQuery, eventNeedsPersistedGeocode } from '../lib/eventGeocode'
import { geocodePlaceQuery } from '../lib/googlePlaces'
import { saveEventGeocodePin } from '../lib/cockpit'
import { SYSTEM_DISTRICT_NAMES, isUrbanRoadName } from '../lib/systemDistricts'
import { buildStaticMapUrl, eventMapCoords } from '../lib/staticMaps'
import { mineFillCtaLabel, cancelledStamp, participationStamp, viewerStamp } from '../lib/status'
import {
  formatDate,
  formatEndTime,
  formatNumber,
  formatPlate,
  formatTime,
  monoClass,
} from '../lib/format'
import { TreatedPlateStack } from '../components/events/TreatedPlateStack'
import { EventMediaGallery } from '../components/events/EventMediaGallery'
import { EventFrozenMark } from '../components/events/EventFrozenMark'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Avatar } from '../components/ui/Avatar'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { OverflowMenu } from '../components/ui/OverflowMenu'
import { Skeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { useToast } from '../components/ui/Toast'
import { ShiftBornFillPage } from './ShiftBornFillPage'

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
  const canDelete = viewerMayDeleteOthersEvents(roles)
  const canSeeLeadKm = roles.includes('admin') || roles.includes('shift_lead')
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [geocodeCoords, setGeocodeCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    let active = true
    setState('loading')
    setMapFailed(false)
    setGeocodeCoords(null)

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

  useEffect(() => {
    if (state !== 'ready' || !event || event.id !== eventId || geocodeCoords) return
    const placesAssisted =
      isUrbanRoadName(event.road?.name) ||
      event.district?.name === SYSTEM_DISTRICT_NAMES.station_other_duplicated
    if (
      !eventNeedsPersistedGeocode({
        location: event.location,
        location_lat: event.location_lat,
        location_lng: event.location_lng,
        location_pin_source: event.location_pin_source,
        roadName: event.road?.name,
        placesAssisted,
      })
    ) {
      return
    }
    const query = eventGeocodeQuery(event.road?.name, event.location)
    if (!query) return
    let active = true
    void geocodePlaceQuery(query).then((coords) => {
      if (!active || !coords) return
      setGeocodeCoords(coords)
      if (canEdit) {
        void saveEventGeocodePin({ eventId: event.id, lat: coords.lat, lng: coords.lng }).then(
          (result) => {
            if (!active || !result.ok) return
            setEvent((current) =>
              current && current.id === event.id
                ? {
                    ...current,
                    location_lat: coords.lat,
                    location_lng: coords.lng,
                    location_pin_source: 'geocode',
                  }
                : current,
            )
          },
        )
      }
    })
    return () => {
      active = false
    }
  }, [canEdit, event, eventId, geocodeCoords, state])

  const backButton = (
    <div className="detail__back">
      <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
        אירועים
      </Button>
    </div>
  )

  if (state === 'ready' && event?.origin === 'shift' && canEdit) {
    return <ShiftBornFillPage eventId={eventId} onBack={onBack} onCompleted={onBack} />
  }

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

  const coords =
    eventMapCoords(event.location_lat, event.location_lng) ?? geocodeCoords
  const mapUrl = coords
    ? buildStaticMapUrl({
        lat: coords.lat,
        lng: coords.lng,
        width: 640,
        height: 320,
        zoom: 14,
        scale: 2,
      })
    : null
  const showMap = Boolean(mapUrl) && !mapFailed

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

  const letterhead = (
    <div className="detail__letterhead">
      {backButton}

      <div className="detail__title-row">
        <div>
          <h1 className="t-title">
            <span className="event-card__type">
              <EventFrozenMark flags={event} />
              {eventLabel}
            </span>
          </h1>
          <p className="t-caption text-muted">{subLine.join(' · ')}</p>
        </div>
        <span className="event-stamps">
          {event.is_cancelled ? <StampChip {...cancelledStamp()} header /> : null}
          <StampChip {...viewerStamp(event.status, mine)} header />
        </span>
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
    </div>
  )

  return (
    <div className={['detail', showMap ? 'detail--has-map' : ''].filter(Boolean).join(' ')}>
      {showMap && mapUrl ? (
        <div className="detail__hero">
          <div className="detail__map-hero" aria-hidden="true">
            <img
              className="detail__map-hero__img"
              src={mapUrl}
              alt=""
              draggable={false}
              onError={() => setMapFailed(true)}
            />
            <div className="detail__map-hero__fade" />
            <div className="detail__map-hero__scrim" />
          </div>
          {letterhead}
        </div>
      ) : (
        letterhead
      )}

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
            {event.is_cancelled ? <LedgerRow label="בוטל" value="כן" /> : null}
            <LedgerRow label="כביש" value={event.road?.name} />
            <LedgerRow label="מיקום" value={event.location ?? undefined} />
            <LedgerRow label="נת״צ" value={event.bus_lane ? 'כן' : 'לא'} />
            {event.origin === 'shift' ? (
              <LedgerRow
                label="מספרי כלי רכב"
                value={
                  event.treated_plates.length > 0 ? (
                    <TreatedPlateStack plates={event.treated_plates} />
                  ) : undefined
                }
              />
            ) : null}
          </Ledger>
          {event.notes ? (
            <div className="detail__notes">
              <p className="t-label text-secondary">הערות</p>
              <p className="t-body">{event.notes}</p>
            </div>
          ) : null}
          <EventMediaGallery
            eventId={event.id}
            canWrite={
              Boolean(user?.id) &&
              !event.is_cancelled &&
              event.responders.some((row) => row.responder_id === user?.id)
            }
            showEmptyCopy
            viewerId={user?.id ?? null}
          />
        </section>

        <section className="stack-4">
          <div className="row-between">
            <h2 className="t-section">מתנדבים ({event.responders.length})</h2>
            <p className="t-caption text-muted">
              <span className="mono">
                {doneCount}/{event.responders.length}
              </span>{' '}
              הושלמו
            </p>
          </div>

          {event.responders.length === 0 ? (
            <p className="card t-body text-secondary">לא שובצו מתנדבים לאירוע זה.</p>
          ) : (
            event.responders.map((responder) => {
              const isViewer = responder.responder_id === user?.id
              return (
                <ResponderCard
                  key={responder.id}
                  responder={responder}
                  eventDate={event.event_date}
                  isViewer={isViewer}
                  defaultOpen={responderCardStartsOpen({
                    isViewer,
                    manages: canSeeLeadKm,
                  })}
                  onFillOwn={
                    isViewer && responder.status !== 'done' && onFillOwn
                      ? onFillOwn
                      : undefined
                  }
                  fillLabel={
                    isViewer ? (mineFillCtaLabel(responder.status) ?? undefined) : undefined
                  }
                  onEditLeadFields={
                    onEditLeadFields
                      ? () => onEditLeadFields(responder.responder_id)
                      : undefined
                  }
                  showLeadKm={canSeeLeadKm}
                  showOdometers={responderCardShowsOdometers({
                    isViewer,
                    manages: canSeeLeadKm,
                  })}
                  showTreatedPlates={event.origin !== 'shift'}
                />
              )
            })
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
        <p className="t-body">הפעולה תמחק גם את נתוני המתנדבים המשויכים. לא ניתן לשחזר.</p>
      </Dialog>
    </div>
  )
}

function ResponderCard({
  responder,
  eventDate,
  isViewer,
  defaultOpen,
  onFillOwn,
  fillLabel,
  onEditLeadFields,
  showLeadKm,
  showOdometers,
  showTreatedPlates,
}: {
  responder: EventResponderDetail
  eventDate: string
  isViewer: boolean
  defaultOpen: boolean
  onFillOwn?: () => void
  fillLabel?: string
  onEditLeadFields?: () => void
  showLeadKm: boolean
  showOdometers: boolean
  showTreatedPlates: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const name = responder.profile?.full_name ?? 'מתנדב'
  const treated = responder.treated
    .map((row) => `${row.kind?.name ?? 'רכב'} × ${row.quantity}`)
    .join(', ')
  const bodyId = `responder-card-${responder.id}`

  return (
    <article className={['card', open ? 'stack-3' : ''].join(' ')}>
      <header className={open ? 'responder-card__head' : 'responder-card__head responder-card__head--flush'}>
        <button
          type="button"
          className="responder-card__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `צמצום הדיווח של ${name}` : `הרחבת הדיווח של ${name}`}
          onClick={() => setOpen((current) => !current)}
        >
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
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            className={['responder-card__chevron', open ? 'is-rotated' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </header>

      {open ? (
        <div id={bodyId} className="responder-card__body stack-3">
          <Ledger>
            <LedgerRow label="זמן התחלה" value={formatTime(responder.started_at)} numeric />
            <LedgerRow
              label="זמן סיום"
              value={formatEndTime(responder.ended_at, eventDate)}
              numeric
            />
            {showLeadKm ? (
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
            ) : null}
            <LedgerRow label="אמצעים" value={responder.emergency_means ? 'כן' : 'לא'} />
            <LedgerRow label="רכבים שטופלו" value={treated || undefined} />
            {showTreatedPlates ? (
              <LedgerRow
                label="מספרי כלי רכב"
                value={
                  responder.treated_plates.length > 0 ? (
                    <TreatedPlateStack plates={responder.treated_plates} />
                  ) : undefined
                }
              />
            ) : null}
            <LedgerRow
              label="לוחית רישוי"
              value={responder.vehicle_plate ? formatPlate(responder.vehicle_plate) : undefined}
              numeric
              isolate
            />
            {showOdometers ? (
              <>
                <LedgerRow
                  label='מד אוץ התחלה'
                  value={responder.odometer_start != null ? formatNumber(responder.odometer_start) : undefined}
                  numeric
                />
                <LedgerRow
                  label='מד אוץ סיום'
                  value={responder.odometer_end != null ? formatNumber(responder.odometer_end) : undefined}
                  numeric
                />
              </>
            ) : null}
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
        </div>
      ) : null}
    </article>
  )
}
