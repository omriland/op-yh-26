export type CockpitPath = { eventId?: string }

export function parseCockpitPath(pathname: string): CockpitPath | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/cockpit') return {}
  const match = /^\/cockpit\/([^/]+)$/.exec(path)
  if (!match) return null
  try {
    return { eventId: decodeURIComponent(match[1]!) }
  } catch {
    return { eventId: match[1] }
  }
}

export function cockpitPath(eventId?: string): string {
  return eventId ? `/cockpit/${encodeURIComponent(eventId)}` : '/cockpit'
}

export function cockpitUrlAction(
  currentPathname: string,
  nextEventId: string | undefined,
  inCockpit: boolean,
): { method: 'push' | 'replace'; path: string } | null {
  const current = parseCockpitPath(currentPathname)
  if (inCockpit) {
    const path = cockpitPath(nextEventId)
    if (!current) return { method: 'push', path }
    if (current.eventId === nextEventId) return null
    return { method: 'replace', path }
  }
  if (current) return { method: 'replace', path: '/' }
  return null
}

export function withPathname(href: string, pathname: string): string {
  const url = new URL(href)
  url.pathname = pathname
  return `${url.pathname}${url.search}${url.hash}`
}

export function applyCockpitUrl(
  history: Pick<History, 'pushState' | 'replaceState' | 'state'>,
  location: { href: string; pathname: string },
  nextEventId: string | undefined,
  inCockpit: boolean,
): void {
  const action = cockpitUrlAction(location.pathname, nextEventId, inCockpit)
  if (!action) return
  const next = withPathname(location.href, action.path)
  if (action.method === 'push') history.pushState(history.state, '', next)
  else history.replaceState(history.state, '', next)
}
