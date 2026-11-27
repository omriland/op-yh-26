import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { fetchEventDetail } from '../../lib/events'
import type { FreezeViewer } from '../../lib/eventFreeze'
import type { EventPreviewSource } from '../../lib/eventPreview'
import {
  createEventDetailCache,
  createHoverPreviewController,
  type EventDetailCache,
  type EventDetailCacheEntry,
  type HoverPreviewController,
} from '../../lib/hoverPreviewController'
import { placePreviewCard } from '../../lib/hoverPreviewPlacement'
import { EventPreviewCard } from './EventPreviewCard'

type PreviewSession = {
  controller: HoverPreviewController
  cache: EventDetailCache<EventPreviewSource>
}

type EventHoverPreview = {
  rowProps: (rowKey: string, eventId: string | undefined) => HTMLAttributes<HTMLTableRowElement>
  previewCard: ReactNode
}

/** What a row opens and which element the card is placed next to. */
type RowTarget = { eventId: string; element: HTMLElement }

const IDLE_ENTRY: EventDetailCacheEntry<EventPreviewSource> = { status: 'idle' }
const HIDDEN_STYLE: CSSProperties = { top: 0, left: 0, visibility: 'hidden' }
const NO_ROW_PROPS: HTMLAttributes<HTMLTableRowElement> = {}
const subscribeNothing = () => () => {}

function isMouseLike(event: PointerEvent): boolean {
  return event.pointerType === 'mouse' || event.pointerType === 'pen'
}

/**
 * A new controller and cache per mounted report, created in an effect so React's
 * double mount in development does not reuse a disposed controller.
 */
function usePreviewSession(enabled: boolean): PreviewSession | null {
  const [session, setSession] = useState<PreviewSession | null>(null)

  useEffect(() => {
    if (!enabled) return
    const next: PreviewSession = {
      controller: createHoverPreviewController(),
      cache: createEventDetailCache<EventPreviewSource>(fetchEventDetail),
    }
    setSession(next)
    return () => {
      next.controller.dispose()
      next.cache.clear()
      setSession(null)
    }
  }, [enabled])

  return session
}

function useOpenRowKey(session: PreviewSession | null): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => (session ? session.controller.subscribe(onChange) : subscribeNothing()),
    [session],
  )
  const getSnapshot = useCallback(() => session?.controller.openRowKey() ?? null, [session])
  return useSyncExternalStore(subscribe, getSnapshot)
}

function useCacheEntry(session: PreviewSession | null, eventId: string | null) {
  const subscribe = useCallback(
    (onChange: () => void) => (session ? session.cache.subscribe(onChange) : subscribeNothing()),
    [session],
  )
  const getSnapshot = useCallback(
    () => (session && eventId ? session.cache.peek(eventId) : IDLE_ENTRY),
    [session, eventId],
  )
  return useSyncExternalStore(subscribe, getSnapshot)
}

function isKeyboardFocused(element: HTMLElement | null): boolean {
  return element !== null && document.activeElement === element && element.matches(':focus-visible')
}

/** Closes the open preview on Escape and when the page scrolls outside the card. */
function useCloseTriggers(
  session: PreviewSession | null,
  isOpen: boolean,
  cardRef: RefObject<HTMLDivElement | null>,
  getAnchor: () => HTMLElement | null,
) {
  useEffect(() => {
    if (!session || !isOpen) return
    const { controller } = session

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') controller.escape()
    }
    function onScroll(event: Event) {
      const target = event.target
      if (target instanceof Node && cardRef.current?.contains(target)) return
      // The browser scrolls a keyboard-focused row into view; that must not close its card.
      if (isKeyboardFocused(getAnchor())) return
      controller.scroll()
    }

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [session, isOpen, cardRef, getAnchor])
}

function usePreviewPlacement(
  openKey: string | null,
  status: string,
  getAnchor: () => HTMLElement | null,
  pointerXRef: RefObject<number | undefined>,
  cardRef: RefObject<HTMLDivElement | null>,
) {
  const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE)

  useLayoutEffect(() => {
    const anchor = getAnchor()
    const card = cardRef.current
    if (!openKey || !anchor || !card) {
      setStyle(HIDDEN_STYLE)
      return
    }
    function place() {
      if (!anchor || !card) return
      const spot = placePreviewCard({
        anchor: anchor.getBoundingClientRect(),
        card: { width: card.offsetWidth, height: card.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        direction: getComputedStyle(anchor).direction === 'rtl' ? 'rtl' : 'ltr',
        pointerX: pointerXRef.current,
      })
      setStyle({ top: spot.top, left: spot.left, maxHeight: spot.maxHeight, visibility: 'visible' })
    }
    function placeAgainWhenFocused() {
      if (isKeyboardFocused(anchor)) place()
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', placeAgainWhenFocused, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', placeAgainWhenFocused, true)
    }
  }, [openKey, status, getAnchor, pointerXRef, cardRef])

  return style
}

/**
 * Hover and focus preview of an event for report table rows. Spread
 * `rowProps(rowKey, eventId)` on each row of every table of the report and render
 * `previewCard` once. A focused row
 * opens its event on Enter, like a click.
 */
export function useEventHoverPreview({
  enabled,
  viewer,
  onOpenEvent,
}: {
  enabled: boolean
  viewer: FreezeViewer
  onOpenEvent: (eventId: string) => void
}): EventHoverPreview {
  const session = usePreviewSession(enabled)
  const openKey = useOpenRowKey(session)
  const targetsRef = useRef(new Map<string, RowTarget>())
  const pointerXRef = useRef<number | undefined>(undefined)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const cardId = useId()
  const getAnchor = useCallback(
    () => (openKey ? (targetsRef.current.get(openKey)?.element ?? null) : null),
    [openKey],
  )
  const openEventId = openKey ? (targetsRef.current.get(openKey)?.eventId ?? null) : null
  const entry = useCacheEntry(session, openEventId)
  const style = usePreviewPlacement(openKey, entry.status, getAnchor, pointerXRef, cardRef)

  useCloseTriggers(session, openKey !== null, cardRef, getAnchor)

  useEffect(() => {
    if (session && openEventId) void session.cache.load(openEventId)
  }, [session, openEventId])

  const rowProps = (rowKey: string, eventId: string | undefined): HTMLAttributes<HTMLTableRowElement> => {
    if (!session || !eventId) return NO_ROW_PROPS
    const { controller } = session
    const remember = (element: HTMLElement) => targetsRef.current.set(rowKey, { eventId, element })
    return {
      tabIndex: 0,
      'aria-describedby': openKey === rowKey ? cardId : undefined,
      onPointerEnter: (event: PointerEvent<HTMLTableRowElement>) => {
        if (!isMouseLike(event)) return
        remember(event.currentTarget)
        pointerXRef.current = event.clientX
        controller.pointerEnterRow(rowKey)
      },
      onPointerMove: (event: PointerEvent<HTMLTableRowElement>) => {
        if (isMouseLike(event)) pointerXRef.current = event.clientX
      },
      onPointerLeave: (event: PointerEvent<HTMLTableRowElement>) => {
        if (isMouseLike(event)) controller.pointerLeaveRow(rowKey)
      },
      onFocus: (event: FocusEvent<HTMLTableRowElement>) => {
        // A mouse click also focuses the row; only keyboard focus opens at once.
        if (!(event.target as Element).matches(':focus-visible')) return
        remember(event.currentTarget)
        pointerXRef.current = undefined
        controller.focusRow(rowKey)
      },
      onBlur: () => controller.blurRow(rowKey),
      onClickCapture: () => controller.rowClicked(),
      onKeyDown: (event: ReactKeyboardEvent<HTMLTableRowElement>) => {
        // Enter on the row itself, not on a button inside it.
        if (event.key !== 'Enter' || event.target !== event.currentTarget) return
        event.preventDefault()
        controller.rowClicked()
        onOpenEvent(eventId)
      },
    }
  }

  const previewCard =
    session && openKey
      ? createPortal(
          <EventPreviewCard
            ref={cardRef}
            id={cardId}
            entry={entry}
            viewer={viewer}
            style={style}
            onPointerEnter={session.controller.pointerEnterCard}
            onPointerLeave={session.controller.pointerLeaveCard}
          />,
          document.body,
        )
      : null

  return { rowProps, previewCard }
}
