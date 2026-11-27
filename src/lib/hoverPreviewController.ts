export const HOVER_PREVIEW_OPEN_DELAY_MS = 300
export const HOVER_PREVIEW_CLOSE_GRACE_MS = 200

type OpenListener = (openRowKey: string | null) => void

export type HoverPreviewController = {
  openRowKey: () => string | null
  subscribe: (listener: OpenListener) => () => void
  pointerEnterRow: (rowKey: string) => void
  pointerLeaveRow: (rowKey: string) => void
  pointerEnterCard: () => void
  pointerLeaveCard: () => void
  focusRow: (rowKey: string) => void
  blurRow: (rowKey: string) => void
  escape: () => void
  scroll: () => void
  rowClicked: () => void
  dispose: () => void
}

/**
 * Decides which row's preview is open. Pointer rests open it after a delay,
 * keyboard focus opens it at once, and leaving closes it after a short grace
 * so the pointer can travel from the row into the card.
 */
export function createHoverPreviewController(): HoverPreviewController {
  const listeners = new Set<OpenListener>()
  let openId: string | null = null
  let openTimer: ReturnType<typeof setTimeout> | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function cancelOpen() {
    if (openTimer === null) return
    clearTimeout(openTimer)
    openTimer = null
  }

  function cancelClose() {
    if (closeTimer === null) return
    clearTimeout(closeTimer)
    closeTimer = null
  }

  function setOpen(next: string | null) {
    if (openId === next) return
    openId = next
    listeners.forEach((listener) => listener(next))
  }

  function closeNow() {
    cancelOpen()
    cancelClose()
    setOpen(null)
  }

  function closeAfterGrace() {
    if (openId === null) return
    cancelClose()
    closeTimer = setTimeout(closeNow, HOVER_PREVIEW_CLOSE_GRACE_MS)
  }

  function openAfterDelay(rowKey: string) {
    cancelOpen()
    openTimer = setTimeout(() => {
      openTimer = null
      cancelClose()
      setOpen(rowKey)
    }, HOVER_PREVIEW_OPEN_DELAY_MS)
  }

  function ifActive(action: () => void): () => void {
    return () => {
      if (!disposed) action()
    }
  }

  return {
    openRowKey: () => openId,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    pointerEnterRow(rowKey) {
      if (disposed) return
      cancelClose()
      if (openId === rowKey) {
        cancelOpen()
        return
      }
      openAfterDelay(rowKey)
    },
    pointerLeaveRow() {
      if (disposed) return
      cancelOpen()
      closeAfterGrace()
    },
    pointerEnterCard: ifActive(cancelClose),
    pointerLeaveCard: ifActive(closeAfterGrace),
    focusRow(rowKey) {
      if (disposed) return
      cancelOpen()
      cancelClose()
      setOpen(rowKey)
    },
    blurRow(rowKey) {
      if (disposed || openId !== rowKey) return
      closeAfterGrace()
    },
    escape: ifActive(closeNow),
    scroll: ifActive(closeNow),
    rowClicked: ifActive(closeNow),
    dispose() {
      disposed = true
      cancelOpen()
      cancelClose()
      listeners.clear()
    },
  }
}

export type EventDetailCacheEntry<Detail> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; detail: Detail }
  | { status: 'error' }
  | { status: 'missing' }

type EntryListener = (eventId: string) => void

export type EventDetailCache<Detail> = {
  peek: (eventId: string) => EventDetailCacheEntry<Detail>
  load: (eventId: string) => Promise<void>
  subscribe: (listener: EntryListener) => () => void
  clear: () => void
}

const IDLE_ENTRY = { status: 'idle' } as const
const LOADING_ENTRY = { status: 'loading' } as const
const ERROR_ENTRY = { status: 'error' } as const
const MISSING_ENTRY = { status: 'missing' } as const

/**
 * One fetch per event id for the life of the cache. Concurrent loads share one
 * request, a failed load can be retried, and `load` never rejects.
 */
export function createEventDetailCache<Detail>(
  fetchDetail: (eventId: string) => Promise<Detail | null>,
): EventDetailCache<Detail> {
  const entries = new Map<string, EventDetailCacheEntry<Detail>>()
  const inFlight = new Map<string, Promise<void>>()
  const listeners = new Set<EntryListener>()
  let generation = 0

  function setEntry(eventId: string, entry: EventDetailCacheEntry<Detail>) {
    entries.set(eventId, entry)
    listeners.forEach((listener) => listener(eventId))
  }

  async function fetchInto(eventId: string, startedIn: number) {
    let result: EventDetailCacheEntry<Detail>
    try {
      const detail = await fetchDetail(eventId)
      result = detail === null ? MISSING_ENTRY : { status: 'ready', detail }
    } catch {
      result = ERROR_ENTRY
    }
    if (startedIn !== generation) return
    inFlight.delete(eventId)
    setEntry(eventId, result)
  }

  return {
    peek: (eventId) => entries.get(eventId) ?? IDLE_ENTRY,
    load(eventId) {
      const running = inFlight.get(eventId)
      if (running) return running
      const current = entries.get(eventId)
      if (current && current.status !== 'error') return Promise.resolve()

      const request = fetchInto(eventId, generation)
      inFlight.set(eventId, request)
      setEntry(eventId, LOADING_ENTRY)
      return request
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      generation += 1
      entries.clear()
      inFlight.clear()
    },
  }
}
