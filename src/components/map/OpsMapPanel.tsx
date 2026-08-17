import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'
import { LocationPlacesField } from '../events/LocationPlacesField'
import { EmptyState } from '../ui/EmptyState'
import { EventListSkeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'
import {
  createLabeledPin,
  ISRAEL_CENTER,
  loadGoogleMaps,
  type GoogleMap,
  type MapPinOverlay,
  type MapsApi,
} from '../../lib/googleMaps'
import { hasGoogleMapsApiKey } from '../../lib/googlePlaces'
import { emptyLocationPlaceFields } from '../../lib/systemDistricts'
import { monoClass } from '../../lib/format'
import {
  fetchActiveUserMapPins,
  formatMapDistanceKm,
  mapBoundsForRadiusKm,
  mapUserPinChrome,
  nearbyResponders,
  SEARCH_VIEW_RADIUS_KM,
  type MapPin,
  type NearbyResponder,
} from '../../lib/userAddresses'
import type { CockpitEventPin } from '../../lib/cockpit'
import { fetchLiveMapPins, subscribeLiveMapPins, type LiveMapPin } from '../../lib/liveMapPins'
import { freshLivePins, LIVE_PIN_STALE_CHECK_MS, planLivePinSync } from '../../lib/liveTrack'

export type SearchOrigin = {
  location: string
  lat: number
  lng: number
}

type MapSession = {
  maps: MapsApi
  map: GoogleMap
  searchOverlay: MapPinOverlay | null
}

type OpsMapPanelProps = {
  eventPins?: CockpitEventPin[]
  onEventSelect?: (eventId: string) => void
  fill?: boolean
  requirePins?: boolean
}

export function OpsMapPanel({
  eventPins = [],
  onEventSelect,
  fill = false,
  requirePins = true,
}: OpsMapPanelProps) {
  const { show } = useToast()
  const [pins, setPins] = useState<MapPin[] | null>(null)
  const [livePins, setLivePins] = useState<LiveMapPin[]>([])
  const [clockMs, setClockMs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(emptyLocationPlaceFields())
  const [origin, setOrigin] = useState<SearchOrigin | null>(null)
  const [focusUserId, setFocusUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchActiveUserMapPins()
      .then((next) => {
        if (active) setPins(next)
      })
      .catch(() => {
        if (active) setError('טעינת הכתובות נכשלה. בדקו את החיבור ונסו שוב.')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    function loadLive() {
      fetchLiveMapPins()
        .then((next) => {
          if (active) setLivePins(next)
        })
        .catch(() => {
          if (active) setLivePins([])
        })
    }
    loadLive()
    const unsubscribe = subscribeLiveMapPins(loadLive)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setClockMs(Date.now()), LIVE_PIN_STALE_CHECK_MS)
    return () => window.clearInterval(id)
  }, [])

  const visibleLivePins = useMemo(() => freshLivePins(livePins, clockMs), [livePins, clockMs])

  const nearby = useMemo(
    () => (origin && pins ? nearbyResponders(pins, origin, SEARCH_VIEW_RADIUS_KM) : []),
    [origin, pins],
  )

  function handleSearchChange(next: typeof search) {
    setSearch(next)
    if (next.location_place_id && next.location_lat != null && next.location_lng != null) {
      setOrigin({
        location: next.location,
        lat: next.location_lat,
        lng: next.location_lng,
      })
      setFocusUserId(null)
      return
    }
    if (!next.location.trim()) {
      setOrigin(null)
      setFocusUserId(null)
    }
  }

  const hasPins = (pins?.length ?? 0) > 0 || eventPins.length > 0 || visibleLivePins.length > 0
  const showMap = !requirePins || hasPins || Boolean(origin)

  return (
    <div className={['ops-map-panel', fill ? 'ops-map-panel--fill' : 'stack-4'].join(' ')}>
      {error ? (
        <p className="form-alert" role="alert">
          {error}
        </p>
      ) : pins === null ? (
        <EventListSkeleton count={2} />
      ) : !hasGoogleMapsApiKey() ? (
        <EmptyState
          icon={<MapPinned size={32} strokeWidth={1.75} aria-hidden="true" />}
          title="המפה אינה זמינה"
          caption="חסר מפתח Google Maps. פנו למנהל המערכת."
        />
      ) : (
        <>
          <LocationPlacesField
            label="חיפוש כתובת"
            allowFreeText={false}
            placeholder="הקלידו כתובת ובחרו מהרשימה"
            value={search}
            onChange={handleSearchChange}
            onAutocompleteUnavailable={() =>
              show('השלמת כתובת מגוגל אינה זמינה כרגע.', 'alert')
            }
          />
          {origin ? (
            <NearbyRespondersList
              origin={origin}
              rows={nearby}
              hasPins={pins.length > 0}
              focusUserId={focusUserId}
              onFocus={setFocusUserId}
            />
          ) : null}
          {!showMap ? (
            <EmptyState
              icon={<MapPinned size={32} strokeWidth={1.75} aria-hidden="true" />}
              title="אין כתובות להצגה"
              caption="כשתמלאו כתובת למשתמש פעיל, היא תופיע כאן."
            />
          ) : (
            <OpsMapCanvas
              pins={pins}
              eventPins={eventPins}
              livePins={visibleLivePins}
              origin={origin}
              focusUserId={focusUserId}
              onEventSelect={onEventSelect}
              fill={fill}
            />
          )}
        </>
      )}
    </div>
  )
}

function NearbyRespondersList({
  origin,
  rows,
  hasPins,
  focusUserId,
  onFocus,
}: {
  origin: SearchOrigin
  rows: NearbyResponder[]
  hasPins: boolean
  focusUserId: string | null
  onFocus: (userId: string) => void
}) {
  return (
    <section className="user-map-nearby" aria-label="כוננים קרובים">
      <div className="form-section">
        <h2 className="form-section__heading">כוננים קרובים</h2>
      </div>
      <p className="t-caption text-muted">{origin.location}</p>
      <p className="t-caption text-muted">
        כוננים בטווח {formatMapDistanceKm(SEARCH_VIEW_RADIUS_KM)}, לפי הכתובת הקרובה ביותר. לחצו על
        כונן כדי למקד את המפה.
      </p>
      {rows.length === 0 ? (
        <p className="t-body text-muted">
          {hasPins
            ? `אין כוננים בטווח ${formatMapDistanceKm(SEARCH_VIEW_RADIUS_KM)}.`
            : 'אין כתובות כוננים להשוואה.'}
        </p>
      ) : (
        <ol className="user-map-nearby__list">
          {rows.map((row) => (
            <li key={row.userId}>
              <button
                type="button"
                className={[
                  'user-map-nearby__row',
                  focusUserId === row.userId ? 'user-map-nearby__row--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onFocus(row.userId)}
              >
                <span className="user-map-nearby__who">
                  <span className={monoClass(row.callsign)}>{row.callsign}</span>
                  <span className="t-body">{row.fullName}</span>
                </span>
                <span className="user-map-nearby__meta t-caption text-secondary">
                  {row.name} · <span className="mono">{formatMapDistanceKm(row.km)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function applyMapView(
  session: MapSession,
  pins: MapPin[],
  eventPins: CockpitEventPin[],
  origin: SearchOrigin | null,
  focusUserId: string | null,
) {
  session.searchOverlay?.setMap(null)
  session.searchOverlay = null

  const bounds = new session.maps.LatLngBounds()
  if (origin) {
    const overlay = createLabeledPin(
      session.maps,
      { lat: origin.lat, lng: origin.lng },
      origin.location,
      origin.location,
      'search',
    )
    overlay.setMap(session.map)
    session.searchOverlay = overlay
    const box = mapBoundsForRadiusKm(origin, SEARCH_VIEW_RADIUS_KM)
    bounds.extend({ lat: box.south, lng: box.west })
    bounds.extend({ lat: box.north, lng: box.east })
  } else {
    for (const pin of pins) bounds.extend({ lat: pin.lat, lng: pin.lng })
    for (const pin of eventPins) bounds.extend({ lat: pin.lat, lng: pin.lng })
  }

  const focus = focusUserId
    ? (origin
        ? nearbyResponders(pins, origin, SEARCH_VIEW_RADIUS_KM).find((row) => row.userId === focusUserId)
        : pins.find((pin) => pin.userId === focusUserId))
    : null

  if (focus) {
    session.map.panTo({ lat: focus.lat, lng: focus.lng })
    session.map.setZoom(14)
    return
  }

  if (!bounds.isEmpty()) session.map.fitBounds(bounds, origin ? 0 : 64)
}

function OpsMapCanvas({
  pins,
  eventPins,
  livePins,
  origin,
  focusUserId,
  onEventSelect,
  fill,
}: {
  pins: MapPin[]
  eventPins: CockpitEventPin[]
  livePins: LiveMapPin[]
  origin: SearchOrigin | null
  focusUserId: string | null
  onEventSelect?: (eventId: string) => void
  fill: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<MapSession | null>(null)
  const staticOverlaysRef = useRef<MapPinOverlay[]>([])
  const liveOverlaysRef = useRef(new Map<string, MapPinOverlay>())
  const onEventSelectRef = useRef(onEventSelect)
  onEventSelectRef.current = onEventSelect
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false

    void loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !hostRef.current) return
        const map = new maps.Map(hostRef.current, {
          center: ISRAEL_CENTER,
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        })
        sessionRef.current = { maps, map, searchOverlay: null }
        setMapReady(true)
      })
      .catch(() => {
        if (!cancelled) setMapError('טעינת המפה מגוגל נכשלה.')
      })

    return () => {
      cancelled = true
      for (const overlay of staticOverlaysRef.current) overlay.setMap(null)
      staticOverlaysRef.current = []
      for (const overlay of liveOverlaysRef.current.values()) overlay.setMap(null)
      liveOverlaysRef.current.clear()
      sessionRef.current?.searchOverlay?.setMap(null)
      sessionRef.current = null
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    for (const overlay of staticOverlaysRef.current) overlay.setMap(null)
    staticOverlaysRef.current = []
    const overlays: MapPinOverlay[] = []
    for (const pin of pins) {
      const chrome = mapUserPinChrome(pin)
      const overlay = createLabeledPin(
        session.maps,
        { lat: pin.lat, lng: pin.lng },
        pin.label,
        `${pin.fullName} · ${pin.formattedAddress}`,
        'user',
        undefined,
        chrome.tooltip,
        chrome.unavailable,
      )
      overlay.setMap(session.map)
      overlays.push(overlay)
    }
    for (const pin of eventPins) {
      const overlay = createLabeledPin(
        session.maps,
        { lat: pin.lat, lng: pin.lng },
        pin.label,
        pin.title,
        'event',
        onEventSelectRef.current
          ? () => onEventSelectRef.current?.(pin.eventId)
          : undefined,
      )
      overlay.setMap(session.map)
      overlays.push(overlay)
    }
    staticOverlaysRef.current = overlays
  }, [mapReady, pins, eventPins])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    applyMapView(session, pins, eventPins, origin, focusUserId)
  }, [mapReady, origin, focusUserId, pins, eventPins])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    const plan = planLivePinSync(liveOverlaysRef.current.keys(), livePins)
    for (const id of plan.remove) {
      liveOverlaysRef.current.get(id)?.setMap(null)
      liveOverlaysRef.current.delete(id)
    }
    for (const pin of plan.update) {
      const overlay = liveOverlaysRef.current.get(pin.assignmentId)
      overlay?.setPosition({ lat: pin.lat, lng: pin.lng })
      overlay?.setCopy(pin.label, pin.tooltip)
    }
    for (const pin of plan.add) {
      const overlay = createLabeledPin(
        session.maps,
        { lat: pin.lat, lng: pin.lng },
        pin.label,
        pin.tooltip,
        'live',
        undefined,
        { text: pin.tooltip, live: true },
      )
      overlay.setMap(session.map)
      liveOverlaysRef.current.set(pin.assignmentId, overlay)
    }
  }, [mapReady, livePins])

  if (mapError) {
    return (
      <p className="form-alert" role="alert">
        {mapError}
      </p>
    )
  }

  return (
    <div
      className={['user-map', fill ? 'user-map--fill' : ''].filter(Boolean).join(' ')}
      role="region"
      aria-label="מפת כתובות ואירועים"
    >
      <div ref={hostRef} className="user-map__canvas" />
    </div>
  )
}
