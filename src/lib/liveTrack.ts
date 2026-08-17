import { isValidIlMobile } from './phoneE164'

export const LIVE_PING_MIN_INTERVAL_MS = 10_000
export const LIVE_PING_MIN_MOVE_M = 50
export const LIVE_TRACK_SMS_ALLOWLIST_DEFAULT = '336'
export const LIVE_TRACK_SMS_ALLOWLIST_ALL = '*'

export type LatLngAt = {
  lat: number
  lng: number
  atMs: number
}

export type TrackingAssignment = {
  id: string
  endedAt: string | null
}

export function parseTrackTokenFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const token = params.get('track_token')?.trim()
  return token || null
}

export function buildTrackUrl(origin: string, token: string): string {
  const url = new URL(origin.endsWith('/') ? origin : `${origin}/`)
  url.searchParams.set('track_token', token)
  return url.toString()
}

export function buildTrackSms(trackUrl: string): string {
  return [
    `שובצת לאירוע ביחפצ - לשיתוף מיקום בזמן אמת לחץ על הלינק: ${trackUrl}`,
    'השאירו את הדף פתוח עד סיום האירוע.',
  ].join('\n')
}

export function planTrackingSync(input: {
  previous: TrackingAssignment[]
  next: TrackingAssignment[]
}): { startIds: string[]; stopIds: string[] } {
  const previousById = new Map(input.previous.map((row) => [row.id, row]))
  const nextIds = new Set(input.next.map((row) => row.id))
  const startIds: string[] = []
  const stopIds: string[] = []

  for (const row of input.previous) {
    if (!nextIds.has(row.id)) stopIds.push(row.id)
  }

  for (const row of input.next) {
    const prior = previousById.get(row.id)
    if (!prior) {
      if (!row.endedAt?.trim()) startIds.push(row.id)
      continue
    }
    if (row.endedAt?.trim() && !prior.endedAt?.trim()) stopIds.push(row.id)
  }

  return { startIds, stopIds }
}

export function pingRefusal(input: {
  hashMatches: boolean
  expiresAt: string | null
  now: Date
  assignmentExists: boolean
  endedAt: string | null
}): 'invalid' | 'expired' | 'ended' | null {
  if (!input.assignmentExists || !input.hashMatches) return 'invalid'
  if (!input.expiresAt || new Date(input.expiresAt).getTime() <= input.now.getTime()) {
    return 'expired'
  }
  if (input.endedAt?.trim()) return 'ended'
  return null
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthM = 6_371_000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function shouldEmitPing(last: LatLngAt | null, next: LatLngAt): boolean {
  if (!last) return true
  if (next.atMs - last.atMs >= LIVE_PING_MIN_INTERVAL_MS) return true
  return metersBetween(last, next) >= LIVE_PING_MIN_MOVE_M
}

export function livePinLabel(person: { callsign: string | null; fullName: string }): string {
  const callsign = person.callsign?.trim()
  const who = callsign || person.fullName.trim() || 'כונן'
  return `${who} · בדרך`
}

export function formatJerusalemClock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function livePinTooltip(input: { eventLine: string | null; recordedAt: string }): string {
  const clock = formatJerusalemClock(input.recordedAt)
  const line = input.eventLine?.trim()
  return line ? `${line} · ${clock}` : clock
}

export function liveEventLine(input: {
  eventType: string | null
  road: string | null
  location: string | null
}): string | null {
  const typeName = input.eventType?.trim() ?? ''
  const roadName = input.road?.trim() ?? ''
  const place = input.location?.trim() ?? ''
  const paren = roadName.match(/\((\d+)\)/)
  const digits = roadName.match(/\d+/)
  const roadBit = paren?.[1] ?? digits?.[0] ?? roadName
  const placePart =
    place && roadBit && (place.startsWith(roadBit) || place.includes(` ${roadBit} `))
      ? place
      : [roadBit, place].filter(Boolean).join(' ')
  if (typeName && placePart) return `${typeName} · ${placePart}`
  return typeName || placePart || null
}

export function canStartTracking(input: {
  endedAt: string | null
  trackingSmsSentAt: string | null
  phone: string | null
}): boolean {
  if (input.endedAt?.trim()) return false
  if (input.trackingSmsSentAt) return false
  return isValidIlMobile(input.phone)
}

export type LiveTrackSmsAllowlist = 'all' | Set<string>

export function parseLiveTrackSmsAllowlist(
  raw: string | null | undefined,
): LiveTrackSmsAllowlist {
  const value = (raw ?? LIVE_TRACK_SMS_ALLOWLIST_DEFAULT).trim()
  if (value === LIVE_TRACK_SMS_ALLOWLIST_ALL) return 'all'
  return new Set(
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

export function isLiveTrackSmsAllowed(
  callsign: string | null | undefined,
  allowlist: LiveTrackSmsAllowlist,
): boolean {
  if (allowlist === 'all') return true
  const cs = callsign?.trim()
  return Boolean(cs && allowlist.has(cs))
}

export type LivePinSnapshot = {
  assignmentId: string
  lat: number
  lng: number
  label: string
  tooltip: string
}

export function planLivePinSync(
  previousIds: Iterable<string>,
  next: LivePinSnapshot[],
): { add: LivePinSnapshot[]; update: LivePinSnapshot[]; remove: string[] } {
  const prev = new Set(previousIds)
  const nextIds = new Set(next.map((pin) => pin.assignmentId))
  return {
    add: next.filter((pin) => !prev.has(pin.assignmentId)),
    update: next.filter((pin) => prev.has(pin.assignmentId)),
    remove: [...prev].filter((id) => !nextIds.has(id)),
  }
}
