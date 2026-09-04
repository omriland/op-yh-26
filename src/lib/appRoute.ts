import { isAndroidDownloadPath, ANDROID_DOWNLOAD_PATH } from './androidDownload'
import { isIosDownloadPath, IOS_DOWNLOAD_PATH } from './iosDownload'
import { cockpitPath, parseCockpitPath, withPathname } from './cockpitPath'
import { DELETE_DATA_PATH, isDeleteDataPath } from './deleteDataPage'
import { isOAuthAuthorizePath } from './partnerOAuth'
import { isPrivacyPath, PRIVACY_PATH } from './privacyPageToken'

export type AppRouteView =
  | 'events'
  | 'mine'
  | 'shifts'
  | 'my_shifts'
  | 'contacts'
  | 'cockpit'
  | 'users'
  | 'map'
  | 'reports'
  | 'fuel_quarter'
  | 'lists'
  | 'profile'
  | 'feedback'
  | 'event_locations'
  | 'event_audit'

export type EventSurface =
  | { kind: 'list' }
  | { kind: 'detail'; eventId: string }
  | { kind: 'form'; eventId?: string; focusResponderId?: string }
  | { kind: 'fill'; eventId: string; returnTo: 'list' | 'detail' }

export type ShiftSurface =
  | { kind: 'list' }
  | { kind: 'detail'; shiftId: string }
  | { kind: 'form'; shiftId?: string }

export type AppRouteState = {
  view: AppRouteView
  eventSurface: EventSurface
  shiftSurface: ShiftSurface
  cockpitEventId?: string
  legalPage?: 'privacy' | 'android' | 'ios' | 'delete_data' | null
}

export type ParsedAppLocation =
  | { kind: 'app'; state: AppRouteState }
  | { kind: 'android' }
  | { kind: 'ios' }
  | { kind: 'delete_data' }
  | { kind: 'privacy' }
  | { kind: 'oauth' }
  | { kind: 'home' }

export type AppRouteAccess = {
  manages: boolean
  hasMineList: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
}

const VIEW_TO_SLUG: Record<AppRouteView, string> = {
  events: 'events',
  mine: 'mine',
  shifts: 'shifts',
  my_shifts: 'my-shifts',
  contacts: 'contacts',
  cockpit: 'cockpit',
  users: 'users',
  map: 'map',
  reports: 'reports',
  fuel_quarter: 'fuel-quarter',
  lists: 'lists',
  profile: 'profile',
  feedback: 'feedback',
  event_locations: 'event-locations',
  event_audit: 'event-audit',
}

const SLUG_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_TO_SLUG).map(([view, slug]) => [slug, view]),
) as Record<string, AppRouteView>

const RESERVED_ROOTS = new Set([
  'android',
  'delete-data',
  'privacy',
  'oauth',
  'login',
  'fill',
  'track',
  'partner-api',
])

const EVENT_VIEWS = new Set<AppRouteView>(['events', 'mine', 'reports'])
const SHIFT_VIEWS = new Set<AppRouteView>(['shifts', 'my_shifts'])

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/'
}

function encodeSeg(id: string): string {
  return encodeURIComponent(id)
}

function decodeSeg(seg: string): string {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

function isReservedSeg(seg: string): boolean {
  return seg === 'new' || seg === 'edit' || seg === 'fill' || seg === 'event'
}

function eventFromTail(eventId: string, tail: string[], returnTo: 'list' | 'detail'): EventSurface {
  if (tail[0] === 'edit') return { kind: 'form', eventId }
  if (tail[0] === 'fill') return { kind: 'fill', eventId, returnTo }
  return { kind: 'detail', eventId }
}

function parseEventRest(rest: string[]): EventSurface {
  if (rest.length === 0) return { kind: 'list' }
  if (rest.length === 1 && rest[0] === 'new') return { kind: 'form' }
  const id = rest[0]
  if (!id || isReservedSeg(id)) return { kind: 'list' }
  return eventFromTail(decodeSeg(id), rest.slice(1), 'list')
}

function parseShiftState(view: AppRouteView, rest: string[]): AppRouteState {
  const base: AppRouteState = {
    view,
    eventSurface: { kind: 'list' },
    shiftSurface: { kind: 'list' },
  }
  if (rest.length === 0) return base
  if (rest[0] === 'new' && rest.length === 1) {
    return { ...base, shiftSurface: { kind: 'form' } }
  }
  if (rest[0] === 'event' && rest[1] && !isReservedSeg(rest[1])) {
    return {
      ...base,
      eventSurface: eventFromTail(decodeSeg(rest[1]), rest.slice(2), 'list'),
    }
  }
  const shiftIdRaw = rest[0]
  if (!shiftIdRaw || isReservedSeg(shiftIdRaw)) return base
  const shiftId = decodeSeg(shiftIdRaw)
  if (rest.length === 1) {
    return { ...base, shiftSurface: { kind: 'detail', shiftId } }
  }
  if (rest[1] === 'edit' && rest.length === 2) {
    return { ...base, shiftSurface: { kind: 'form', shiftId } }
  }
  if (rest[1] === 'event' && rest[2] && !isReservedSeg(rest[2])) {
    return {
      view,
      shiftSurface: { kind: 'detail', shiftId },
      eventSurface: eventFromTail(decodeSeg(rest[2]), rest.slice(3), 'detail'),
    }
  }
  return base
}

export function parseAppPath(pathname: string): ParsedAppLocation {
  const path = normalizePath(pathname)
  if (path === '/') return { kind: 'home' }
  if (isAndroidDownloadPath(path)) return { kind: 'android' }
  if (isIosDownloadPath(path)) return { kind: 'ios' }
  if (isDeleteDataPath(path)) return { kind: 'delete_data' }
  if (isPrivacyPath(path)) return { kind: 'privacy' }
  if (isOAuthAuthorizePath(path)) return { kind: 'oauth' }

  const cockpit = parseCockpitPath(path)
  if (cockpit) {
    return {
      kind: 'app',
      state: {
        view: 'cockpit',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'list' },
        cockpitEventId: cockpit.eventId,
      },
    }
  }

  const parts = path.slice(1).split('/').filter(Boolean)
  const slug = parts[0]
  if (!slug || RESERVED_ROOTS.has(slug) || !(slug in SLUG_TO_VIEW)) {
    return { kind: 'home' }
  }
  const view = SLUG_TO_VIEW[slug]
  if (EVENT_VIEWS.has(view)) {
    return {
      kind: 'app',
      state: {
        view,
        eventSurface: parseEventRest(parts.slice(1)),
        shiftSurface: { kind: 'list' },
      },
    }
  }
  if (SHIFT_VIEWS.has(view)) {
    return { kind: 'app', state: parseShiftState(view, parts.slice(1)) }
  }
  if (parts.length > 1) return { kind: 'home' }
  return {
    kind: 'app',
    state: {
      view,
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
    },
  }
}

function eventPathSuffix(surface: EventSurface): string {
  switch (surface.kind) {
    case 'list':
      return ''
    case 'detail':
      return `/${encodeSeg(surface.eventId)}`
    case 'form':
      return surface.eventId ? `/${encodeSeg(surface.eventId)}/edit` : '/new'
    case 'fill':
      return `/${encodeSeg(surface.eventId)}/fill`
  }
}

function shiftPathSuffix(shift: ShiftSurface, event: EventSurface): string {
  const eventSuffix = event.kind === 'list' ? '' : `/event${eventPathSuffix(event)}`
  switch (shift.kind) {
    case 'list':
      return eventSuffix
    case 'detail':
      return `/${encodeSeg(shift.shiftId)}${eventSuffix}`
    case 'form':
      return shift.shiftId ? `/${encodeSeg(shift.shiftId)}/edit` : '/new'
  }
}

export function appPath(state: AppRouteState): string {
  if (state.legalPage === 'android') return ANDROID_DOWNLOAD_PATH
  if (state.legalPage === 'ios') return IOS_DOWNLOAD_PATH
  if (state.legalPage === 'delete_data') return DELETE_DATA_PATH
  if (state.legalPage === 'privacy') return PRIVACY_PATH
  if (state.view === 'cockpit') return cockpitPath(state.cockpitEventId)
  const root = `/${VIEW_TO_SLUG[state.view]}`
  if (EVENT_VIEWS.has(state.view)) return `${root}${eventPathSuffix(state.eventSurface)}`
  if (SHIFT_VIEWS.has(state.view)) {
    return `${root}${shiftPathSuffix(state.shiftSurface, state.eventSurface)}`
  }
  return root
}

export function readBootRoute(pathname: string): {
  view: AppRouteView | null
  eventSurface: EventSurface
  shiftSurface: ShiftSurface
  cockpitEventId?: string
  legalPage: 'privacy' | 'android' | 'ios' | 'delete_data' | null
} {
  const parsed = parseAppPath(pathname)
  if (parsed.kind === 'android') {
    return {
      view: null,
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
      legalPage: 'android',
    }
  }
  if (parsed.kind === 'ios') {
    return {
      view: null,
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
      legalPage: 'ios',
    }
  }
  if (parsed.kind === 'delete_data') {
    return {
      view: null,
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
      cockpitEventId: undefined,
      legalPage: 'delete_data',
    }
  }
  if (parsed.kind === 'privacy') {
    return {
      view: null,
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
      legalPage: 'privacy',
    }
  }
  if (parsed.kind === 'app') {
    return {
      view: parsed.state.view,
      eventSurface: parsed.state.eventSurface,
      shiftSurface: parsed.state.shiftSurface,
      cockpitEventId: parsed.state.cockpitEventId,
      legalPage: null,
    }
  }
  return {
    view: null,
    eventSurface: { kind: 'list' },
    shiftSurface: { kind: 'list' },
    legalPage: null,
  }
}

export function isAllowedAppView(view: AppRouteView, access: AppRouteAccess): boolean {
  switch (view) {
    case 'mine':
    case 'my_shifts':
      return access.hasMineList
    case 'contacts':
    case 'map':
    case 'profile':
      return true
    case 'events':
    case 'shifts':
    case 'reports':
    case 'cockpit':
      return access.manages
    case 'users':
    case 'fuel_quarter':
    case 'lists':
      return access.isAdmin
    case 'feedback':
    case 'event_locations':
    case 'event_audit':
      return access.isSuperAdmin
  }
}

function pathSegments(pathname: string): string[] {
  const path = normalizePath(pathname)
  if (path === '/') return []
  return path.slice(1).split('/').filter(Boolean)
}

function isIdAssignment(prev: string, next: string): boolean {
  const prevParts = pathSegments(prev)
  const nextParts = pathSegments(next)
  if (prevParts.length < 2 || nextParts.length < 3) return false
  if (prevParts[0] !== nextParts[0]) return false
  if (prevParts[prevParts.length - 1] !== 'new') return false
  if (nextParts[nextParts.length - 1] !== 'edit') return false
  return nextParts.length === prevParts.length + 1
}

function isCockpitEventSwap(prev: string, next: string): boolean {
  return Boolean(parseCockpitPath(prev) && parseCockpitPath(next))
}

export function appHistoryMethod(
  currentPathname: string,
  nextPathname: string,
  options: { adoptHome?: boolean } = {},
): 'push' | 'replace' | null {
  const current = normalizePath(currentPathname)
  const next = normalizePath(nextPathname)
  if (current === next) return null
  if (current === '/') return options.adoptHome ? 'replace' : null
  if (isIdAssignment(current, next) || isCockpitEventSwap(current, next)) return 'replace'
  const currentParts = pathSegments(current)
  const nextParts = pathSegments(next)
  if (
    currentParts[0] &&
    currentParts[0] === nextParts[0] &&
    nextParts.length < currentParts.length
  ) {
    return 'replace'
  }
  return 'push'
}

export function applyAppUrl(
  history: Pick<History, 'pushState' | 'replaceState' | 'state'>,
  location: { href: string; pathname: string },
  state: AppRouteState,
  options: { adoptHome?: boolean } = {},
): void {
  const path = appPath(state)
  const method = appHistoryMethod(location.pathname, path, options)
  if (!method) return
  const next = withPathname(location.href, path)
  if (method === 'push') history.pushState(history.state, '', next)
  else history.replaceState(history.state, '', next)
}

export function shouldSyncAppUrl(input: {
  trackToken: boolean
  oauthPath: boolean
  passwordSetup: boolean
  fillTokenOwnsUrl: boolean
  privacyChecking: boolean
}): boolean {
  if (input.trackToken || input.oauthPath || input.passwordSetup) return false
  if (input.fillTokenOwnsUrl || input.privacyChecking) return false
  return true
}
