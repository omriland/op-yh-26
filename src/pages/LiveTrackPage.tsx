import { useEffect, useRef, useState } from 'react'
import { MapPin, ShieldAlert } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { StampChip } from '../components/ui/StampChip'
import { loadTrackByToken, pingTrackLocation } from '../lib/liveTrackApi'
import { liveTrackPositionOptions, shouldEmitPing, type LatLngAt } from '../lib/liveTrack'

type PageState =
  | { kind: 'loading' }
  | { kind: 'need_permission' }
  | { kind: 'asking' }
  | { kind: 'sharing' }
  | { kind: 'denied' }
  | { kind: 'ended' }
  | { kind: 'invalid'; message: string }

type LiveTrackPageProps = {
  trackToken: string
}

type WakeLockSentinel = { release: () => Promise<void> }

export function LiveTrackPage({ trackToken }: LiveTrackPageProps) {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const watchId = useRef<number | null>(null)
  const lastPing = useRef<LatLngAt | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const starting = useRef(false)
  const startBtnWrapRef = useRef<HTMLDivElement>(null)
  const startSharingRef = useRef<() => void>(() => {})

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

  useEffect(() => {
    if (state.kind !== 'need_permission') return
    const button = startBtnWrapRef.current?.querySelector('button')
    if (!button) return
    const onClick = () => {
      startSharingRef.current()
    }
    button.addEventListener('click', onClick, true)
    return () => button.removeEventListener('click', onClick, true)
  }, [state.kind])

  function stopWatching() {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    void wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  function requestWakeLock() {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
    }
    void nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        wakeLock.current = lock
      })
      .catch(() => {})
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

  function onGeoDenied() {
    starting.current = false
    stopWatching()
    setState({ kind: 'denied' })
  }

  function startSharing() {
    if (starting.current) return
    if (!navigator.geolocation) {
      setState({ kind: 'denied' })
      return
    }
    starting.current = true
    // GPS first, still on the tap stack. Wake Lock / setState after this can eat iOS user-activation.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({ kind: 'sharing' })
        void onFix(pos.coords)
        requestWakeLock()
        if (watchId.current != null) return
        watchId.current = navigator.geolocation.watchPosition(
          (next) => {
            void onFix(next.coords)
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) onGeoDenied()
          },
          liveTrackPositionOptions('watch'),
        )
      },
      () => {
        onGeoDenied()
      },
      liveTrackPositionOptions('first'),
    )
    setState({ kind: 'asking' })
  }

  startSharingRef.current = startSharing

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
              <div ref={startBtnWrapRef}>
                <Button
                  type="button"
                  variant="primary"
                  block
                  loading={state.kind === 'asking'}
                  onClick={startSharing}
                >
                  התחלת שיתוף מיקום
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
