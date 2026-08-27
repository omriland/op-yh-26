import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'
import { MapLayersControl } from './MapLayersControl'
import { MapPinLegend } from './MapPinLegend'
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
import { formatNumber, monoClass } from '../../lib/format'
import {
  applyLiveDelta,
  cullLivePinsToBbox,
  liveDeltaFromChange,
  liveMotionPosition,
  pushLiveMotion,
  type LiveMotion,
} from '../../lib/liveMapChannel'
import {
  bboxFromGoogleMap,
  catalogViewForViewport,
  ISRAEL_VIEW_BBOX,
  sameViewport,
  zoomAfterCatalogClusterClick,
} from '../../lib/mapCatalogView'
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
import {
  OPS_MAP_FOCUS_ZOOM,
  opsMapEventFocusTarget,
  opsMapViewTrigger,
  shouldRefitOpsMapView,
} from '../../lib/opsMapView'
import { defaultOpsMapLayers, type OpsMapLayers } from '../../lib/policeStations'
import { attachPoliceStationLayer } from '../../lib/policeStationsMap'

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

const EMPTY_EVENT_PINS: CockpitEventPin[] = []

type OpsMapPanelProps = {
  eventPins?: CockpitEventPin[]
  focusEventId?: string
  focusEventRequestId?: number
  onEventSelect?: (eventId: string) => void
  onEventPinMove?: (eventId: string, lat: number, lng: number) => void
  fill?: boolean
  requirePins?: boolean
}

export function OpsMapPanel({
  eventPins = EMPTY_EVENT_PINS,
  focusEventId,
  focusEventRequestId,
  onEventSelect,
  onEventPinMove,
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
  const [ignoreEventFocus, setIgnoreEventFocus] = useState(false)

  useEffect(() => {
    setIgnoreEventFocus(false)
  }, [focusEventRequestId])

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
    const unsubscribe = subscribeLiveMapPins((change) => {
      const delta = liveDeltaFromChange(change)
      if (!delta) {
        loadLive()
        return
      }
      setLivePins((current) => {
        const next = applyLiveDelta(current, delta)
        if (next.needsSnapshot) loadLive()
        return next.pins
      })
    })
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
      setIgnoreEventFocus(true)
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

  function handleNearbyFocus(userId: string) {
    setIgnoreEventFocus(true)
    setFocusUserId(userId)
  }

  const activeFocusEventId = ignoreEventFocus ? undefined : focusEventId

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
              onFocus={handleNearbyFocus}
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
              focusEventId={activeFocusEventId}
              focusEventRequestId={focusEventRequestId}
              onEventSelect={onEventSelect}
              onEventPinMove={onEventPinMove}
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
  focusEventId?: string | null,
): boolean {
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

  const eventFocus = opsMapEventFocusTarget(eventPins, focusEventId)
  if (eventFocus) {
    session.map.panTo(eventFocus)
    session.map.setZoom(OPS_MAP_FOCUS_ZOOM)
    return true
  }

  const focus = focusUserId
    ? (origin
        ? nearbyResponders(pins, origin, SEARCH_VIEW_RADIUS_KM).find((row) => row.userId === focusUserId)
        : pins.find((pin) => pin.userId === focusUserId))
    : null

  if (focus) {
    session.map.panTo({ lat: focus.lat, lng: focus.lng })
    session.map.setZoom(OPS_MAP_FOCUS_ZOOM)
    return true
  }

  if (!bounds.isEmpty()) {
    session.map.fitBounds(bounds, origin ? 0 : 64)
    return true
  }
  return false
}

function OpsMapCanvas({
  pins,
  eventPins,
  livePins,
  origin,
  focusUserId,
  focusEventId,
  focusEventRequestId,
  onEventSelect,
  onEventPinMove,
  fill,
}: {
  pins: MapPin[]
  eventPins: CockpitEventPin[]
  livePins: LiveMapPin[]
  origin: SearchOrigin | null
  focusUserId: string | null
  focusEventId?: string
  focusEventRequestId?: number
  onEventSelect?: (eventId: string) => void
  onEventPinMove?: (eventId: string, lat: number, lng: number) => void
  fill: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<MapSession | null>(null)
  const staticOverlaysRef = useRef<MapPinOverlay[]>([])
  const liveOverlaysRef = useRef(new Map<string, MapPinOverlay>())
  const onEventSelectRef = useRef(onEventSelect)
  onEventSelectRef.current = onEventSelect
  const onEventPinMoveRef = useRef(onEventPinMove)
  onEventPinMoveRef.current = onEventPinMove
  const userHasMovedMapRef = useRef(false)
  const applyingViewRef = useRef(true)
  const viewInitializedRef = useRef(false)
  const prevOriginRef = useRef(origin)
  const prevFocusUserIdRef = useRef(focusUserId)
  const prevFocusEventIdRef = useRef(focusEventId)
  const prevFocusEventRequestIdRef = useRef(focusEventRequestId)
  const eventFocusAppliedKeyRef = useRef<string | null>(null)
  const mapListenersRef = useRef<{ remove: () => void }[]>([])
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [layers, setLayers] = useState<OpsMapLayers>(defaultOpsMapLayers)
  const policeLayerRef = useRef<ReturnType<typeof attachPoliceStationLayer> | null>(null)
  const [viewport, setViewport] = useState({ bbox: ISRAEL_VIEW_BBOX, zoom: 8 })
  const motionsRef = useRef(new Map<string, LiveMotion>())
  const displayRef = useRef(new Map<string, { lat: number; lng: number }>())

  const catalogView = useMemo(
    () => catalogViewForViewport(pins, viewport.bbox, viewport.zoom),
    [pins, viewport],
  )
  const liveInView = useMemo(
    () => cullLivePinsToBbox(livePins, viewport.bbox),
    [livePins, viewport],
  )

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
          fullscreenControlOptions: maps.ControlPosition
            ? { position: maps.ControlPosition.RIGHT_BOTTOM }
            : undefined,
          gestureHandling: 'greedy',
        })
        policeLayerRef.current = attachPoliceStationLayer(maps, map)
        function markUserMoved() {
          if (applyingViewRef.current) return
          userHasMovedMapRef.current = true
        }
        mapListenersRef.current = [
          map.addListener('dragstart', markUserMoved),
          map.addListener('zoom_changed', markUserMoved),
          map.addListener('idle', () => {
            applyingViewRef.current = false
            const next = bboxFromGoogleMap(map)
            if (next) {
              setViewport((current) => (sameViewport(current, next) ? current : next))
            }
          }),
        ]
        sessionRef.current = { maps, map, searchOverlay: null }
        setMapReady(true)
      })
      .catch(() => {
        if (!cancelled) setMapError('טעינת המפה מגוגל נכשלה.')
      })

    return () => {
      cancelled = true
      for (const listener of mapListenersRef.current) listener.remove()
      mapListenersRef.current = []
      for (const overlay of staticOverlaysRef.current) overlay.setMap(null)
      staticOverlaysRef.current = []
      for (const overlay of liveOverlaysRef.current.values()) overlay.setMap(null)
      liveOverlaysRef.current.clear()
      policeLayerRef.current?.detach()
      policeLayerRef.current = null
      sessionRef.current?.searchOverlay?.setMap(null)
      sessionRef.current = null
      userHasMovedMapRef.current = false
      applyingViewRef.current = true
      viewInitializedRef.current = false
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    for (const overlay of staticOverlaysRef.current) overlay.setMap(null)
    staticOverlaysRef.current = []
    const overlays: MapPinOverlay[] = []
    for (const pin of catalogView.points) {
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
        undefined,
        chrome.tone === 'phone' ? 'user-map-pin--phone' : undefined,
      )
      overlay.setMap(session.map)
      overlays.push(overlay)
    }
    for (const cluster of catalogView.clusters) {
      const count = formatNumber(cluster.count)
      const overlay = createLabeledPin(
        session.maps,
        { lat: cluster.lat, lng: cluster.lng },
        count,
        `${count} כתובות`,
        'user',
        () => {
          const map = sessionRef.current?.map
          if (!map) return
          map.panTo({ lat: cluster.lat, lng: cluster.lng })
          map.setZoom(Math.min(16, zoomAfterCatalogClusterClick(map.getZoom() ?? 8)))
        },
        { text: `${count} כתובות` },
        false,
        undefined,
        'user-map-pin--cluster',
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
        undefined,
        false,
        (next) => onEventPinMoveRef.current?.(pin.eventId, next.lat, next.lng),
      )
      overlay.setMap(session.map)
      overlays.push(overlay)
    }
    staticOverlaysRef.current = overlays
  }, [mapReady, catalogView, eventPins])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    const eventFocusKey =
      focusEventId != null && focusEventRequestId != null
        ? `${focusEventId}:${focusEventRequestId}`
        : null
    const eventTarget = opsMapEventFocusTarget(eventPins, focusEventId)
    const eventFocusReady =
      Boolean(eventFocusKey && eventTarget) &&
      eventFocusAppliedKeyRef.current !== eventFocusKey
    const trigger = opsMapViewTrigger({
      initialized: viewInitializedRef.current,
      originChanged: origin !== prevOriginRef.current,
      focusChanged:
        focusUserId !== prevFocusUserIdRef.current ||
        focusEventId !== prevFocusEventIdRef.current ||
        focusEventRequestId !== prevFocusEventRequestIdRef.current ||
        eventFocusReady,
    })
    prevOriginRef.current = origin
    prevFocusUserIdRef.current = focusUserId
    prevFocusEventIdRef.current = focusEventId
    prevFocusEventRequestIdRef.current = focusEventRequestId
    if (!shouldRefitOpsMapView(trigger, userHasMovedMapRef.current)) return
    applyingViewRef.current = true
    const moved = applyMapView(
      session,
      pins,
      eventPins,
      origin,
      focusUserId,
      focusEventId,
    )
    viewInitializedRef.current = true
    if (moved && eventFocusKey && eventTarget) {
      eventFocusAppliedKeyRef.current = eventFocusKey
    }
    if (!moved) applyingViewRef.current = false
  }, [mapReady, origin, focusUserId, focusEventId, focusEventRequestId, pins, eventPins])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    const plan = planLivePinSync(liveOverlaysRef.current.keys(), liveInView)
    const now = Date.now()
    for (const id of plan.remove) {
      liveOverlaysRef.current.get(id)?.setMap(null)
      liveOverlaysRef.current.delete(id)
      motionsRef.current.delete(id)
      displayRef.current.delete(id)
    }
    for (const pin of plan.update) {
      const overlay = liveOverlaysRef.current.get(pin.assignmentId)
      const shown = displayRef.current.get(pin.assignmentId) ?? { lat: pin.lat, lng: pin.lng }
      motionsRef.current.set(pin.assignmentId, pushLiveMotion(shown, { lat: pin.lat, lng: pin.lng }, now))
      overlay?.setCopy(pin.label, pin.tooltip)
    }
    for (const pin of plan.add) {
      displayRef.current.set(pin.assignmentId, { lat: pin.lat, lng: pin.lng })
      motionsRef.current.delete(pin.assignmentId)
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
  }, [mapReady, liveInView])

  useEffect(() => {
    if (!mapReady) return
    let raf = 0
    const tick = () => {
      if (!document.hidden) {
        const now = Date.now()
        for (const [id, overlay] of liveOverlaysRef.current) {
          const motion = motionsRef.current.get(id)
          if (!motion) continue
          const pos = liveMotionPosition(motion, now)
          displayRef.current.set(id, pos)
          overlay.setPosition(pos)
        }
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [mapReady])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !mapReady) return
    policeLayerRef.current?.setVisible(layers.policeStations)
  }, [mapReady, layers.policeStations])

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
      <MapPinLegend />
      <MapLayersControl layers={layers} onChange={setLayers} />
    </div>
  )
}
