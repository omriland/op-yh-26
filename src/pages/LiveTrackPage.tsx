import { useEffect, useRef, useState } from 'react'
import { MapPin, ShieldAlert } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { StampChip } from '../components/ui/StampChip'
import { loadTrackByToken, pingTrackLocation } from '../lib/liveTrackApi'
import { shouldEmitPing, type LatLngAt } from '../lib/liveTrack'

type PageState =
  | { kind: 'loading' }
  | { kind: 'need_permission' }
  | { kind: 'sharing' }
  | { kind: 'denied' }
  | { kind: 'ended' }
  | { kind: 'invalid'; message: string }

type LiveTrackPageProps = {
  trackToken: string
}

export function LiveTrackPage({ trackToken }: LiveTrackPageProps) {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const watchId = useRef<number | null>(null)
  const lastPing = useRef<LatLngAt | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  useEffect(() => {
    let active = true
    loadTrackByToken(trackToken)
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setState({ kind: 'need_permission' })
          return
        }
        if (result.code === 'ended') setState({ kind: 'ended' })
        else setState({ kind: 'invalid', message: result.error })
      })
      .catch(() => {
        if (active) {
          setState({ kind: 'invalid', message: 'קישור המעקב אינו תקין או שפג תוקפו.' })
        }
      })
    return () => {
      active = false
    }
  }, [trackToken])

  useEffect(() => {
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current)
      }
      void wakeLock.current?.release().catch(() => {})
    }
  }, [])

  function stopWatching() {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    void wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  async function onFix(coords: GeolocationCoordinates) {
    const next: LatLngAt = {
      lat: coords.latitude,
      lng: coords.longitude,
      atMs: Date.now(),
    }
    if (!shouldEmitPing(lastPing.current, next)) return
    lastPing.current = next
    const result = await pingTrackLocation({
      trackToken,
      lat: next.lat,
      lng: next.lng,
      accuracyM: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
      recordedAt: new Date().toISOString(),
    })
    if (result.ok) return
    stopWatching()
    if (result.code === 'ended') setState({ kind: 'ended' })
    else setState({ kind: 'invalid', message: result.error })
  }

  function startSharing() {
    if (!navigator.geolocation) {
      setState({ kind: 'denied' })
      return
    }
    setState({ kind: 'sharing' })
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    void nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        wakeLock.current = lock
      })
      .catch(() => {})

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        void onFix(pos.coords)
      },
      (err) => {
        stopWatching()
        if (err.code === err.PERMISSION_DENIED) setState({ kind: 'denied' })
        else setState({ kind: 'denied' })
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
  }

  return (
    <div className="live-track" data-theme="field">
      <div className="live-track__card" data-theme="field">
        {state.kind === 'loading' ? (
          <p className="t-body text-muted">טוען…</p>
        ) : state.kind === 'invalid' ? (
          <EmptyState
            icon={<ShieldAlert size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="קישור המעקב"
            caption={state.message}
          />
        ) : state.kind === 'ended' ? (
          <EmptyState
            icon={<MapPin size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="המעקב הסתיים"
            caption="אין צורך להשאיר דף זה פתוח"
          />
        ) : state.kind === 'denied' ? (
          <EmptyState
            icon={<ShieldAlert size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="שיתוף מיקום"
            caption="יש לאשר מיקום בדפדפן כדי לשתף."
          />
        ) : (
          <>
            <h1 className="t-title">שיתוף מיקום</h1>
            <p className="t-body live-track__lead">
              השאירו דף זה פתוח. נעילת המסך או מעבר לאפליקציה אחרת יפסיקו את השיתוף.
            </p>
            {state.kind === 'sharing' ? (
              <StampChip label="משתף מיקום" tone="pending" />
            ) : (
              <Button type="button" variant="primary" block onClick={startSharing}>
                התחלת שיתוף מיקום
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
