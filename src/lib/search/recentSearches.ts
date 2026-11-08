/** Recent searches live on this device only (they hold names), newest first. */
export const RECENT_SEARCHES_KEY = 'yahpaz.search.recent.v1'
export const RECENT_SEARCHES_MAX = 5

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readRecentSearches(store: Storage | null = storage()): string[] {
  try {
    const raw = store?.getItem(RECENT_SEARCHES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((q): q is string => typeof q === 'string' && q.trim() !== '').slice(0, RECENT_SEARCHES_MAX)
      : []
  } catch {
    return []
  }
}

/** Moves a repeated query to the top instead of listing it twice. */
export function addRecentSearch(q: string, store: Storage | null = storage()): string[] {
  const query = q.trim()
  const current = readRecentSearches(store)
  if (!query) return current
  const next = [query, ...current.filter((item) => item !== query)].slice(0, RECENT_SEARCHES_MAX)
  try {
    store?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {
    // Private mode or full storage: the list lasts for this page only.
  }
  return next
}

export function clearRecentSearches(store: Storage | null = storage()): void {
  try {
    store?.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
}
