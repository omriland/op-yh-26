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
  /** Call after the report changes an event, so the next preview fetches it again. */
  forgetEventDetails: () => void
}

/** What a row opens and which element the card is placed next to. */
type RowTarget = { eventId: string; element: HTMLElement }

const IDLE_ENTRY: EventDetailCacheEntry<EventPreviewSource> = { status: 'idle' }
const HIDDEN_STYLE: CSSProperties = { top: 0, left: 0, visibility: 'hidden' }
const ROOM_PROPERTY = '--event-preview-room'
const ARROW_SCROLL_STEP_PX = 48
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

/**
 * Closes the preview, or cancels one about to open, on Escape and when the page
 * scrolls outside the card. `getOpenRow` must read the controller, not the last
 * render, because a scroll can arrive before React has rendered the open card.
 */
function useCloseTriggers(
  session: PreviewSession | null,
  cardRef: RefObject<HTMLDivElement | null>,
  getOpenRow: () => HTMLElement | null,
) {
  useEffect(() => {
    if (!session) return
    const { controller } = session

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') controller.escape()
    }
    function onScroll(event: Event) {
      const target = event.target
      if (target instanceof Node && cardRef.current?.contains(target)) return
      // The browser scrolls a keyboard-focused row into view; that must not close its card.
      if (isKeyboardFocused(getOpenRow())) return
      controller.scroll()
    }

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [session, cardRef, getOpenRow])
}

/** The card's height with only the stylesheet cap, ignoring the room set by the last placement. */
function unconstrainedCardHeight(card: HTMLElement): number {
  const placedRoom = card.style.getPropertyValue(ROOM_PROPERTY)
  card.style.removeProperty(ROOM_PROPERTY)
  const height = card.offsetHeight
  if (placedRoom) card.style.setProperty(ROOM_PROPERTY, placedRoom)
  return height
}

function usePreviewPlacement(
  openKey: string | null,
  status: string,
  getAnchor: () => HTMLElement | null,
  pointerXRef: RefObject<number | undefined>,
  cardRef: RefObject<HTMLDivElement | null>,
) {
  const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE)
  const openedAtRef = useRef<{ rowKey: string; pointerX: number | undefined } | null>(null)

  useLayoutEffect(() => {
    const anchor = getAnchor()
    const card = cardRef.current
    if (!openKey || !anchor || !card) {
      openedAtRef.current = null
      setStyle(HIDDEN_STYLE)
      return
    }
    // The card keeps the side it opened on: the pointer may since have moved into it.
    if (openedAtRef.current?.rowKey !== openKey) {
      openedAtRef.current = { rowKey: openKey, pointerX: pointerXRef.current }
    }
    const pointerX = openedAtRef.current.pointerX
    function place() {
      if (!anchor || !card) return
      const spot = placePreviewCard({
        anchor: anchor.getBoundingClientRect(),
        card: { width: card.offsetWidth, height: unconstrainedCardHeight(card) },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        direction: getComputedStyle(anchor).direction === 'rtl' ? 'rtl' : 'ltr',
        pointerX,
      })
      setStyle({
        top: spot.top,
        left: spot.left,
        visibility: 'visible',
        [ROOM_PROPERTY]: `${spot.maxHeight}px`,
      } as CSSProperties)
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
  const getOpenRow = useCallback(() => {
    const liveOpenKey = session?.controller.openRowKey()
    return liveOpenKey ? (targetsRef.current.get(liveOpenKey)?.element ?? null) : null
  }, [session])
  const openEventId = openKey ? (targetsRef.current.get(openKey)?.eventId ?? null) : null
  const entry = useCacheEntry(session, openEventId)
  const style = usePreviewPlacement(openKey, entry.status, getAnchor, pointerXRef, cardRef)

  useCloseTriggers(session, cardRef, getOpenRow)

  // Also runs when the entry goes back to idle, after `forgetEventDetails`.
  useEffect(() => {
    if (session && openEventId && entry.status === 'idle') void session.cache.load(openEventId)
  }, [session, openEventId, entry.status])

  const forgetEventDetails = useCallback(() => session?.cache.clear(), [session])

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
        // Keys on the row itself, not on a button inside it.
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter') {
          event.preventDefault()
          controller.rowClicked()
          onOpenEvent(eventId)
          return
        }
        // Arrows scroll a card taller than its room, which the keyboard cannot reach otherwise.
        const card = cardRef.current
        const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp'
        if (!isArrow || openKey !== rowKey || !card || card.scrollHeight <= card.clientHeight) return
        event.preventDefault()
        card.scrollBy({ top: event.key === 'ArrowDown' ? ARROW_SCROLL_STEP_PX : -ARROW_SCROLL_STEP_PX })
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

  return { rowProps, previewCard, forgetEventDetails }
}
