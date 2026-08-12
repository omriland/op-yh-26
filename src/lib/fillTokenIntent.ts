/** Post-login return to a responder fill form (expired fill_token path). */

export const POST_LOGIN_FILL_KEY = 'yahpaz:post_login_fill'

export type PostLoginFillIntent = {
  eventId: string
}

export function parseFillTokenFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const token = params.get('fill_token')?.trim()
  return token || null
}

export function parseFillEventFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const eventId = params.get('fill_event')?.trim()
  return eventId || null
}

export function stashPostLoginFill(eventId: string): void {
  const id = eventId.trim()
  if (!id) return
  try {
    sessionStorage.setItem(POST_LOGIN_FILL_KEY, JSON.stringify({ eventId: id }))
  } catch {
    // ignore quota / private mode
  }
}

export function readPostLoginFill(): PostLoginFillIntent | null {
  try {
    const raw = sessionStorage.getItem(POST_LOGIN_FILL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { eventId?: unknown }
    const eventId = typeof parsed.eventId === 'string' ? parsed.eventId.trim() : ''
    return eventId ? { eventId } : null
  } catch {
    return null
  }
}

export function clearPostLoginFill(): void {
  try {
    sessionStorage.removeItem(POST_LOGIN_FILL_KEY)
  } catch {
    // ignore
  }
}

/** Prefer explicit fill_event query, else stashed post-login intent. */
export function consumeFillEventTarget(search: string): string | null {
  const fromQuery = parseFillEventFromSearch(search)
  if (fromQuery) {
    clearPostLoginFill()
    return fromQuery
  }
  const stashed = readPostLoginFill()
  if (stashed) {
    clearPostLoginFill()
    return stashed.eventId
  }
  return null
}
