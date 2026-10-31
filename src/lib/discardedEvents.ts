/**
 * Untouched empty events this tab just dropped. The delete is not awaited when
 * leaving (and a reload sends it as the page goes away), so a list fetched in
 * the meantime can still return the row. Lists hide these ids until then.
 * sessionStorage: per tab, and it survives a reload.
 */
const KEY = 'yahpaz:discarded_event_ids'
const MAX_IDS = 50

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function tabStorage(): StorageLike | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function read(storage: StorageLike | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function write(storage: StorageLike | null, ids: string[]) {
  try {
    storage?.setItem(KEY, JSON.stringify(ids.slice(-MAX_IDS)))
  } catch {
    /* storage blocked or full: the list may show the row until it reloads */
  }
}

export function rememberDiscardedEventId(id: string, storage = tabStorage()): void {
  write(storage, [...read(storage).filter((known) => known !== id), id])
}

/** The delete failed, so the row is real again. */
export function forgetDiscardedEventId(id: string, storage = tabStorage()): void {
  write(storage, read(storage).filter((known) => known !== id))
}

export function withoutDiscardedEvents<T extends { id: string }>(
  rows: T[],
  storage = tabStorage(),
): T[] {
  const ids = new Set(read(storage))
  if (ids.size === 0) return rows
  return rows.filter((row) => !ids.has(row.id))
}
