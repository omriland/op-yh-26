import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  canViewerDeleteEvent,
  deleteEvent,
  eventDeleteConfirmBody,
  eventDeleteConfirmTitle,
  fetchEventDetail,
  type EventDetail,
  type EventResponderDetail,
} from '../lib/events'
import { isOtherEventTypeName } from '../lib/eventForm'
import { responderCardShowsOdometers, responderCardStartsOpen } from '../lib/responderCard'
import { eventGeocodeQuery, eventNeedsPersistedGeocode } from '../lib/eventGeocode'
import { geocodePlaceQuery } from '../lib/googlePlaces'
import { saveEventGeocodePin } from '../lib/cockpit'
import { SYSTEM_DISTRICT_NAMES, isUrbanRoadName } from '../lib/systemDistricts'
import { buildStaticMapUrl, eventMapCoords } from '../lib/staticMaps'
import {
  cancelledStamp,
  eventStamp,
  leadKmPendingNote,
  mineFillCtaLabel,
  mineParticipationStamp,
  overlayMissingKmOnDoneStamp,
  participationStamp,
} from '../lib/status'
import { eventMissingLeadDoneDetails } from '../lib/eventStatus'
import {
  eventHasMissingResponderKm,
  missingEventFields,
  partialStampHoverText,
} from '../lib/eventIncomplete'
import { shiftBornFillStamp } from '../lib/shiftBornEvents'
import { StampChip } from '../components/ui/StampChip'
import { StampWithNote } from '../components/ui/StampWithNote'
import {
  formatDate,
  formatEndTime,
  formatNumber,
  formatPlate,
  formatTime,
  monoClass,
} from '../lib/format'
import { TreatedPlateStack } from '../components/events/TreatedPlateStack'
import { mergeTreatedPlates } from '../lib/treatedPlates'
import { EventMediaGallery } from '../components/events/EventMediaGallery'
import { EventLeadLedgerRows } from '../components/events/EventShiftLeadsFields'
import { EventFrozenMark } from '../components/events/EventFrozenMark'
import { EventFrozenNotice } from '../components/events/EventFrozenNotice'
import { useFreezeViewer } from '../lib/freezeViewer'
import type { FreezeViewer } from '../lib/eventFreeze'
import { AssignedVolunteerEditBlockedDialog } from '../components/events/AssignedVolunteerEditBlockedDialog'
import { Button } from '../components/ui/Button'
import { AlertDialog } from '../components/ui/AlertDialog'
import { isAssignedVolunteerEventEditBlocked } from '../lib/assignedVolunteerEventEdit'
import { EVENT_EDIT_LOCKED_TOOLTIP, isEventEditAgeLocked } from '../lib/eventEditLock'
import {
  PATROL_CALLSIGN_NUMBER_LABEL,
  PATROL_CALLSIGN_PREFIX_LABEL,
  resolvePatrolCallsign,
} from '../lib/patrolCallsign'
import { mapSecondaryLeadRows, viewerIsEventLead } from '../lib/eventShiftLeads'
import { EmptyState } from '../components/ui/EmptyState'
import { Avatar } from '../components/ui/Avatar'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { OverflowMenu } from '../components/ui/OverflowMenu'
import { Skeleton } from '../components/ui/Skeleton'
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
  const freezeViewer = useFreezeViewer()
  const { show } = useToast()
  const canEdit =
    Boolean(onEdit) &&
    (roles.includes('admin') || roles.includes('shift_lead') || roles.includes('super_admin'))
  const canSeeLeadKm =
    roles.includes('admin') || roles.includes('shift_lead') || roles.includes('super_admin')
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [geocodeCoords, setGeocodeCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [assignedEditBlockedOpen, setAssignedEditBlockedOpen] = useState(false)

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

  const canDelete = canViewerDeleteEvent({
    roles,
    userId: user?.id,
    shiftLeadId: event.shift_lead_id,
  })
  const mine = event.responders.find((row) => row.responder_id === user?.id)?.status ?? null
  const mineKm = event.responders.find((row) => row.responder_id === user?.id)?.total_km ?? null
  const secondaryLeadIds = mapSecondaryLeadRows(event.secondary_leads).map((row) => row.user_id)
  const eventLead = viewerIsEventLead({
    viewerId: user?.id,
    shiftLeadId: event.shift_lead_id,
    secondaryLeadIds,
  })
  const assignedAsResponder = event.responders.some((row) => row.responder_id === user?.id)
  const showLeadKm = eventLead || (canSeeLeadKm && !assignedAsResponder)
  const missingLeadFields = missingEventFields(event)
  const missingLeadStart = !event.started_at?.trim()
  const missingLeadEnd = !event.ended_at?.trim()
  const missingLeadDetails =
    event.origin !== 'shift' && eventMissingLeadDoneDetails(event.ended_at)
  const mineLeadKmNote = leadKmPendingNote(mine, mineKm, event.origin, missingLeadDetails)
  const headerStamp =
    event.origin === 'shift'
      ? shiftBornFillStamp({
          status: event.status,
          police_event_id: event.police_event_id,
          treatment_detail: event.treatment_detail,
          treatment_notes: event.treatment_notes,
          location: event.location,
          treated_count: event.shared_treated?.length ?? 0,
        })
      : mine != null
        ? mineParticipationStamp(mine, mineKm, { missingLeadDetails })
        : overlayMissingKmOnDoneStamp(
            eventStamp(event.status),
            eventLead && eventHasMissingResponderKm(event),
          )
  const headerStampTip =
    headerStamp.label === 'תועד חלקית' ? partialStampHoverText(event) : null
  const assignedEditBlocked = isAssignedVolunteerEventEditBlocked({
    viewerId: user?.id,
    responderIds: event.responders.map((row) => row.responder_id),
    secondaryLeadIds,
    roles,
  })
  const ageLocked = isEventEditAgeLocked({ createdAt: event.created_at, roles })
  const callsign = resolvePatrolCallsign({
    prefix: event.patrol_callsign_prefix,
    number: event.patrol_callsign_number,
    legacy: event.patrol_callsign,
  })
  const doneCount = event.responders.filter((row) => row.status === 'done').length
  // Shift-born events carry event-keyed plates, but a responder filling their own
  // participation writes participation-keyed ones. Both belong in the event ledger.
  const shiftEventPlates = mergeTreatedPlates(
    event.treated_plates,
    ...event.responders.map((row) => row.treated_plates),
  )
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

  function requestEventEdit() {
    if (assignedEditBlocked) {
      setAssignedEditBlockedOpen(true)
      return
    }
    onEdit?.()
  }

  function requestLeadFieldsEdit(responderId: string) {
    if (assignedEditBlocked) {
      setAssignedEditBlockedOpen(true)
      return
    }
    onEditLeadFields?.(responderId)
  }

  const letterhead = (
    <div className="detail__letterhead">
      {backButton}

      <div className="detail__title-row">
        <div>
          <h1 className="t-title">
            <span className="event-card__type">
              <EventFrozenMark event={event} viewer={freezeViewer} />
              {eventLabel}
            </span>
          </h1>
          <p className="t-caption text-muted">{subLine.join(' · ')}</p>
        </div>
        <span className="event-stamps">
          {event.is_cancelled ? <StampChip {...cancelledStamp()} header /> : null}
          <StampWithNote
            {...headerStamp}
            header
            note={mineLeadKmNote}
            tip={headerStampTip}
          />
        </span>
      </div>

      {canEdit || canDelete ? (
        <div className="detail__actions">
          {canEdit ? (
            <span title={ageLocked && !assignedEditBlocked ? EVENT_EDIT_LOCKED_TOOLTIP : undefined}>
              <Button
                variant="secondary"
                disabled={ageLocked && !assignedEditBlocked}
                title={ageLocked && !assignedEditBlocked ? EVENT_EDIT_LOCKED_TOOLTIP : undefined}
                onClick={requestEventEdit}
              >
                עריכת אירוע
              </Button>
            </span>
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
            <EventLeadLedgerRows
              main={event.shift_lead}
              secondaries={event.secondary_leads}
            />
            <LedgerRow label="תאריך" value={formatDate(event.event_date)} numeric />
            <LedgerRow
              label="מספר אירוע"
              value={event.police_event_id ?? undefined}
              numeric
              missing={missingLeadFields.has('police_event_id')}
            />
            <LedgerRow
              label="שלוחה"
              value={event.district?.name}
              missing={missingLeadFields.has('district')}
            />
            {event.station ? <LedgerRow label="תחנה" value={event.station} /> : null}
            {callsign.prefix ? (
              <LedgerRow label={PATROL_CALLSIGN_PREFIX_LABEL} value={callsign.prefix} />
            ) : null}
            <LedgerRow
              label={PATROL_CALLSIGN_NUMBER_LABEL}
              value={callsign.number || undefined}
              numeric
              missing={missingLeadFields.has('patrol_callsign')}
            />
            <LedgerRow
              label="זמן התחלה"
              value={formatTime(event.started_at)}
              numeric
              missing={missingLeadStart}
            />
            <LedgerRow
              label="זמן סיום"
              value={formatEndTime(event.ended_at, event.event_date)}
              numeric
              missing={missingLeadEnd}
            />
            <LedgerRow
              label="סוג אירוע"
              value={event.event_type?.name}
              missing={missingLeadFields.has('event_type')}
            />
            {isOtherEventTypeName(event.event_type?.name) && event.event_type_detail ? (
              <LedgerRow label="פירוט" value={event.event_type_detail} />
            ) : null}
            {event.is_cancelled ? <LedgerRow label="בוטל" value="כן" /> : null}
            <LedgerRow
              label="כביש"
              value={event.road?.name}
              missing={missingLeadFields.has('road')}
            />
            <LedgerRow
              label="מיקום"
              value={event.location ?? undefined}
              missing={missingLeadFields.has('location')}
            />
            <LedgerRow label="נת״צ" value={event.bus_lane ? 'כן' : 'לא'} />
            {event.origin === 'shift' ? (
              <LedgerRow
                label="מספרי כלי רכב"
                value={
                  shiftEventPlates.length > 0 ? (
                    <TreatedPlateStack plates={shiftEventPlates} />
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
                  isViewer={isViewer}
                  defaultOpen={responderCardStartsOpen({
                    isViewer,
                    manages: eventLead,
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
                      ? () => requestLeadFieldsEdit(responder.responder_id)
                      : undefined
                  }
                  showLeadKm={showLeadKm}
                  leadKmMissing={eventLead && responder.total_km == null}
                  showOdometers={responderCardShowsOdometers({
                    isViewer,
                    manages: eventLead,
                  })}
                  showTreatedPlates={event.origin !== 'shift'}
                  origin={event.origin}
                  freezeViewer={freezeViewer}
                  missingLeadDetails={missingLeadDetails}
                />
              )
            })
          )}
        </section>
      </div>

      <AssignedVolunteerEditBlockedDialog
        open={assignedEditBlockedOpen}
        onClose={() => setAssignedEditBlockedOpen(false)}
      />

      <AlertDialog
        open={confirmDelete}
        status="danger"
        title={eventDeleteConfirmTitle(event.police_event_id)}
        busy={deleting}
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
        <p className="t-body">{eventDeleteConfirmBody(event.responders.length)}</p>
      </AlertDialog>
    </div>
  )
}

function ResponderCard({
  responder,
  isViewer,
  defaultOpen,
  onFillOwn,
  fillLabel,
  onEditLeadFields,
  showLeadKm,
  leadKmMissing,
  showOdometers,
  showTreatedPlates,
  origin,
  freezeViewer,
  missingLeadDetails,
}: {
  responder: EventResponderDetail
  isViewer: boolean
  defaultOpen: boolean
  onFillOwn?: () => void
  fillLabel?: string
  onEditLeadFields?: () => void
  showLeadKm: boolean
  leadKmMissing: boolean
  showOdometers: boolean
  showTreatedPlates: boolean
  origin: 'manual' | 'shift'
  freezeViewer?: FreezeViewer | null
  missingLeadDetails: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const name = responder.profile?.full_name ?? 'מתנדב'
  const treated = responder.treated
    .map((row) => `${row.kind?.name ?? 'רכב'} × ${row.quantity}`)
    .join(', ')
  const bodyId = `responder-card-${responder.id}`
  const viewerStampValue =
    origin === 'shift'
      ? participationStamp(responder.status, true)
      : mineParticipationStamp(responder.status, responder.total_km, {
          missingLeadDetails,
        })

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
          <StampWithNote
            {...(isViewer ? viewerStampValue : participationStamp(responder.status, false))}
            note={
              isViewer
                ? leadKmPendingNote(responder.status, responder.total_km, origin, missingLeadDetails)
                : null
            }
          />
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            className={['responder-card__chevron', open ? 'is-rotated' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </header>

      <EventFrozenNotice participation={responder} viewer={freezeViewer} />

      {open ? (
        <div id={bodyId} className="responder-card__body stack-3">
          <Ledger>
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
                missing={leadKmMissing}
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
