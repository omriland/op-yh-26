import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned, Plus, Radar, Trash2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  cockpitDeleteBlock,
  cockpitDeleteHint,
  cockpitEventMapPins,
  geocodeCockpitEventPins,
  mergeCockpitEventPins,
  cockpitPinsMissingStoredCoords,
  saveEventGeocodePin,
  cockpitNeighborId,
  cockpitReelDetail,
  cockpitReelLead,
  cockpitReelTitle,
  cockpitShortcut,
  cockpitWindowCountLabel,
  fetchCockpitReel,
  formatCockpitAge,
  formatCockpitClock,
  insertCockpitDraft,
  isAbandonedEmptyCockpitItem,
  isCockpitTypingTarget,
  saveEventLocationPin,
  type CockpitDeleteHintKind,
  type CockpitEventPin,
  type CockpitReelItem,
} from '../lib/cockpit'
import { hasSeenCockpitIntro, markCockpitIntroSeen } from '../lib/cockpitIntro'
import { deleteEvent } from '../lib/events'
import { discardAbandonedEmptyEventIfAny } from '../lib/eventForm'
import { monoClass } from '../lib/format'
import { cancelledStamp, eventStamp } from '../lib/status'
import { Button, IconButton } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { useToast } from '../components/ui/Toast'
import { OpsMapPanel } from '../components/map/OpsMapPanel'
import { EventFormPage } from './EventFormPage'
import { EventFrozenMark } from '../components/events/EventFrozenMark'

type CockpitPageProps = {
  selectedEventId?: string
  onSelectEvent: (eventId: string | undefined) => void
}

export function CockpitPage({ selectedEventId, onSelectEvent }: CockpitPageProps) {
  const { user, roles } = useAuth()
  const userId = user?.id
  const isAdmin = roles.includes('admin') || roles.includes('super_admin')
  const deleteViewer = { userId, isAdmin }
  const { show } = useToast()
  const [reel, setReel] = useState<CockpitReelItem[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [creating, setCreating] = useState(false)
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)
  const [deleteHint, setDeleteHint] = useState<{
    id: string
    kind: CockpitDeleteHintKind
  } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [mapOpen, setMapOpen] = useState(false)
  const [mapEventFocus, setMapEventFocus] = useState<{
    eventId: string
    requestId: number
  } | null>(null)
  const [introOpen, setIntroOpen] = useState(false)
  const [stageEditing, setStageEditing] = useState(false)
  const knownEventPins = useMemo(() => cockpitEventMapPins(reel), [reel])
  const [geocodedEventPins, setGeocodedEventPins] = useState<CockpitEventPin[]>([])
  const [pinOverrides, setPinOverrides] = useState<Record<string, { lat: number; lng: number }>>(
    {},
  )
  const [locationPinDrop, setLocationPinDrop] = useState<{
    eventId: string
    lat: number
    lng: number
    nonce: number
  } | null>(null)
  const eventPins = useMemo(() => {
    const merged = mergeCockpitEventPins(knownEventPins, geocodedEventPins)
    return merged.map((pin) => {
      const override = pinOverrides[pin.eventId]
      return override ? { ...pin, lat: override.lat, lng: override.lng } : pin
    })
  }, [knownEventPins, geocodedEventPins, pinOverrides])

  useEffect(() => {
    if (!mapOpen) return
    let active = true
    void geocodeCockpitEventPins(reel).then((pins) => {
      if (!active) return
      setGeocodedEventPins(pins)
      for (const pin of cockpitPinsMissingStoredCoords(reel, pins)) {
        void saveEventGeocodePin(pin)
      }
    })
    return () => {
      active = false
    }
  }, [mapOpen, reel])

  function clearDeletePrompt() {
    setArmedDeleteId(null)
    setDeleteHint(null)
  }

  function requestMapEventFocus(eventId: string) {
    setMapEventFocus((prev) => ({
      eventId,
      requestId: (prev?.requestId ?? 0) + 1,
    }))
  }

  function openMap() {
    setMapOpen(true)
    if (selectedEventId) requestMapEventFocus(selectedEventId)
  }

  function closeMap() {
    setMapOpen(false)
    setMapEventFocus(null)
  }

  function selectEvent(eventId: string, opts?: { editing?: boolean }) {
    if (eventId !== selectedEventId) {
      void discardAbandonedEmptyEventIfAny()
      setStageEditing(Boolean(opts?.editing))
    } else if (opts?.editing) {
      setStageEditing(true)
    }
    clearDeletePrompt()
    onSelectEvent(eventId)
    if (mapOpen) requestMapEventFocus(eventId)
  }

  async function handleEventPinMove(eventId: string, lat: number, lng: number) {
    setPinOverrides((current) => ({ ...current, [eventId]: { lat, lng } }))
    if (selectedEventId === eventId && stageEditing) {
      setLocationPinDrop({ eventId, lat, lng, nonce: Date.now() })
      return
    }
    if (!user) return
    const result = await saveEventLocationPin({ eventId, lat, lng, userId: user.id })
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    void reloadReel().catch(() => {})
  }

  async function reloadReel() {
    const rows = await fetchCockpitReel()
    setReel(rows)
    setPinOverrides({})
    return rows
  }

  useEffect(() => {
    if (!deleteHint || deleteHint.kind === 'confirm') return
    const row = reel.find((event) => event.id === deleteHint.id)
    if (!row || cockpitDeleteBlock(row) !== deleteHint.kind) {
      setDeleteHint(null)
    }
  }, [reel, deleteHint])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!userId) return
    setIntroOpen(!hasSeenCockpitIntro(userId))
  }, [userId])

  function dismissIntro() {
    if (userId) markCockpitIntroSeen(userId)
    setIntroOpen(false)
  }

  useEffect(() => {
    let active = true
    fetchCockpitReel()
      .then((rows) => {
        if (!active) return
        setReel(rows)
        setLoadState('ready')
        if (!selectedEventId && rows[0]) onSelectEvent(rows[0].id)
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
    // First paint only — selection after that is inbox-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createNew() {
    if (!user || creating) return
    const current = reel.find((row) => row.id === selectedEventId)
    if (current && isAbandonedEmptyCockpitItem(current)) {
      setStageEditing(true)
      return
    }
    setCreating(true)
    await discardAbandonedEmptyEventIfAny()
    const result = await insertCockpitDraft(user.id)
    setCreating(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    selectEvent(result.eventId, { editing: true })
    void reloadReel().catch(() => {})
  }

  async function confirmDelete(event: CockpitReelItem) {
    const block = cockpitDeleteBlock(event, deleteViewer)
    if (block) {
      setArmedDeleteId(null)
      setDeleteHint({ id: event.id, kind: block })
      return
    }
    if (armedDeleteId !== event.id) {
      setArmedDeleteId(event.id)
      setDeleteHint({ id: event.id, kind: 'confirm' })
      return
    }
    setDeletingId(event.id)
    const result = await deleteEvent(event.id)
    setDeletingId(null)
    clearDeletePrompt()
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('האירוע נמחק', 'done')
    const remaining = reel.filter((row) => row.id !== event.id)
    setReel(remaining)
    if (selectedEventId === event.id) {
      onSelectEvent(remaining[0]?.id)
    }
  }

  const createNewRef = useRef(createNew)
  const confirmDeleteRef = useRef(confirmDelete)
  const dismissIntroRef = useRef(dismissIntro)
  createNewRef.current = createNew
  confirmDeleteRef.current = confirmDelete
  dismissIntroRef.current = dismissIntro

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (introOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          dismissIntroRef.current()
        }
        return
      }
      if (mapOpen && event.key === 'Escape' && !isCockpitTypingTarget(event.target)) {
        event.preventDefault()
        closeMap()
        return
      }
      const action = cockpitShortcut(event, isCockpitTypingTarget(event.target))
      if (!action) return
      event.preventDefault()
      if (action.type === 'create') {
        void createNewRef.current()
        return
      }
      if (action.type === 'select') {
        const next = cockpitNeighborId(
          reel.map((row) => row.id),
          selectedEventId,
          action.direction,
        )
        if (next && next !== selectedEventId) {
          selectEvent(next)
        }
        return
      }
      const current = reel.find((row) => row.id === selectedEventId)
      if (current && deletingId !== current.id) void confirmDeleteRef.current(current)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [deletingId, introOpen, mapOpen, onSelectEvent, reel, selectedEventId])

  return (
    <div className="cockpit">
      <aside className="cockpit__reel" aria-label="יומן משמרת">
        <div className="cockpit__reel-head">
          <div className="cockpit__reel-meta">
            <p className="t-num-lg cockpit__clock" aria-label="שעון ירושלים">
              {formatCockpitClock(now.toISOString())}
            </p>
            {loadState === 'ready' ? (
              <p className="t-caption text-muted">{cockpitWindowCountLabel(reel.length)}</p>
            ) : null}
          </div>
          <Button
            block
            icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
            loading={creating}
            loadingLabel="יוצר…"
            onClick={() => void createNew()}
          >
            אירוע חדש
          </Button>
        </div>
        {loadState === 'loading' ? (
          <div className="cockpit__reel-body">
            <EventListSkeleton count={3} />
          </div>
        ) : loadState === 'error' ? (
          <div className="cockpit__reel-body">
            <EmptyState
              icon={<Radar size={40} strokeWidth={1.75} aria-hidden="true" />}
              title="לא ניתן לטעון את הגלגלת"
              caption="בדקו את החיבור ונסו שוב."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoadState('loading')
                    void reloadReel()
                      .then(() => setLoadState('ready'))
                      .catch(() => setLoadState('error'))
                  }}
                >
                  נסיון נוסף
                </Button>
              }
            />
          </div>
        ) : reel.length === 0 ? (
          <div className="cockpit__reel-body">
            <p className="t-caption text-muted cockpit__reel-empty">
              אין אירועים מהשעתיים האחרונות.
            </p>
          </div>
        ) : (
          <ul className="cockpit__list">
            {reel.map((event) => {
              const current = event.id === selectedEventId
              const stamp = event.is_cancelled ? cancelledStamp() : eventStamp(event.status)
              const policeId = event.police_event_id?.trim()
              const detail = cockpitReelDetail(event)
              const lead = cockpitReelLead(event)
              const armed = armedDeleteId === event.id
              const hint =
                deleteHint?.id === event.id ? cockpitDeleteHint(deleteHint.kind) : null
              return (
                <li
                  key={event.id}
                  className={['cockpit__row', current ? 'is-current' : ''].join(' ')}
                >
                  <button
                    type="button"
                    className="cockpit__item"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => selectEvent(event.id)}
                  >
                    <span
                      className={
                        policeId
                          ? 't-num-lg cockpit__item-id'
                          : 't-body-strong cockpit__item-title is-draft'
                      }
                    >
                      <span className="event-card__type">
                        <EventFrozenMark flags={event} theme="command" />
                        {cockpitReelTitle(event)}
                      </span>
                    </span>
                    {detail ? (
                      <span className="t-body text-secondary cockpit__item-detail">{detail}</span>
                    ) : null}
                    <span className="cockpit__item-stamp">
                      <StampChip {...stamp} />
                      {lead ? (
                        <span className="t-caption text-secondary">
                          {lead.full_name}
                          {lead.callsign ? (
                            <>
                              {' · '}
                              <span className={monoClass(lead.callsign)}>{lead.callsign}</span>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    <span className="cockpit__item-age">
                      <span className="t-caption text-muted">
                        {formatCockpitAge(event.created_at, now)}
                      </span>
                    </span>
                    {hint ? (
                      <span className="t-caption cockpit__delete-hint">{hint}</span>
                    ) : null}
                  </button>
                  {cockpitDeleteBlock(event, deleteViewer) === 'other_lead' ? null : (
                  <IconButton
                    className="cockpit__delete"
                    variant={armed ? 'destructive' : 'ghost'}
                    label={armed ? 'אישור מחיקה' : 'מחיקת אירוע'}
                    disabled={deletingId === event.id}
                    onClick={() => void confirmDelete(event)}
                  >
                    <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section className="cockpit__stage" aria-label="טופס אירוע">
        {selectedEventId ? (
          <EventFormPage
            key={selectedEventId}
            variant="cockpit"
            eventId={selectedEventId}
            blockSelfAssign
            cockpitEditing={stageEditing}
            onRequestCockpitEdit={() => setStageEditing(true)}
            onCancel={() => {
              setStageEditing(false)
              onSelectEvent(undefined)
            }}
            onSaved={() => undefined}
            onSavedAndCreateNew={() => undefined}
            onPersisted={() => {
              void reloadReel().catch(() => {})
            }}
            locationPinDrop={locationPinDrop}
          />
        ) : loadState === 'ready' && reel.length === 0 ? (
          <EmptyState
            icon={
              <picture>
                <source
                  srcSet="/cockpit-quiet-koala.webp"
                  type="image/webp"
                  media="(prefers-reduced-motion: no-preference)"
                />
                <img
                  className="empty__media"
                  src="/cockpit-quiet-koala.png"
                  alt=""
                  width={320}
                  height={320}
                />
              </picture>
            }
            title="אני רואה שהמשמרת שקטה ;)"
            action={
              <Button
                className="btn--compact-icon"
                icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
                loading={creating}
                loadingLabel="יוצר…"
                onClick={() => void createNew()}
              >
                אירוע חדש
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Radar size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="אין אירוע נבחר"
            caption="לחצו על אירוע חדש או בחרו שורה בגלגלת."
            action={
              <Button
                icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
                loading={creating}
                loadingLabel="יוצר…"
                onClick={() => void createNew()}
              >
                אירוע חדש
              </Button>
            }
          />
        )}
      </section>
      {mapOpen ? null : (
        <button
          type="button"
          className="cockpit-map-tab"
          aria-expanded={false}
          aria-controls="cockpit-map-drawer"
          onClick={openMap}
        >
          <MapPinned size={20} strokeWidth={1.75} aria-hidden="true" />
          מפה
        </button>
      )}
      {mapOpen ? (
        <div
          id="cockpit-map-drawer"
          className="cockpit-map-drawer"
          role="dialog"
          aria-modal="false"
          aria-labelledby="cockpit-map-title"
        >
          <header className="cockpit-map-drawer__head">
            <h2 id="cockpit-map-title" className="t-section">
              מפה
            </h2>
            <IconButton label="סגירת המפה" onClick={closeMap}>
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          </header>
          <OpsMapPanel
            fill
            requirePins={false}
            eventPins={eventPins}
            focusEventId={mapEventFocus?.eventId}
            focusEventRequestId={mapEventFocus?.requestId}
            onEventSelect={selectEvent}
            onEventPinMove={(eventId, lat, lng) => {
              void handleEventPinMove(eventId, lat, lng)
            }}
          />
        </div>
      ) : null}
      <Dialog
        open={introOpen}
        title="מאחמ״שים? במשמרת האזנה?"
        onClose={dismissIntro}
        footer={
          <Button autoFocus onClick={dismissIntro}>
            הבנתי
          </Button>
        }
      >
        <div className="cockpit-intro">
          <p className="t-body cockpit-intro__lead">
            סידרנו לכם את סביבת האחמ״ש הכי נוחה שיש!
          </p>
          <ol className="cockpit-intro__steps">
            <li className="cockpit-intro__step">
              <span className="cockpit-intro__icon" aria-hidden="true">
                <Plus size={20} strokeWidth={1.75} />
              </span>
              <p className="t-body">מוסיפים אירועים חדשים בגלגלת בצד ימין</p>
            </li>
            <li className="cockpit-intro__step">
              <span className="cockpit-intro__icon" aria-hidden="true">
                <Radar size={20} strokeWidth={1.75} />
              </span>
              <p className="t-body">מנהלים בקלות את כל האירועים הפתוחים</p>
            </li>
            <li className="cockpit-intro__step">
              <span className="cockpit-intro__icon" aria-hidden="true">
                <MapPinned size={20} strokeWidth={1.75} />
              </span>
              <p className="t-body">
                נעזרים במפה בשמאל כדי למצוא מתנדבים קרובים לאירוע
              </p>
            </li>
          </ol>
        </div>
      </Dialog>
    </div>
  )
}
