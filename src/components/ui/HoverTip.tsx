import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type HoverTipProps = {
  /** Plain-text tip body. Ignored when `content` is set. */
  text?: string
  /** Rich tip body (lists, etc.). */
  content?: ReactNode
  children: ReactNode
  className?: string
  /** Extra class on the portaled tip (not the trigger). */
  tipClassName?: string
  /**
   * `command` (default): overlay chrome.
   * `field`: paper tokens — use when the tip must match Field surfaces.
   */
  theme?: 'command' | 'field'
  /**
   * `truncate` (default): only when the trigger overflows.
   * `always`: whenever tip text/content is present.
   */
  mode?: 'truncate' | 'always'
}

const VIEWPORT_PAD = 8

/**
 * Instant hover tip (no delay). Command overlay chrome by default — same family as menus/toasts.
 *
 * In `always` mode the tip carries information the user cannot get anywhere else
 * (a freeze reason, a filter meaning), so the trigger is focusable and opens on
 * tap and on Enter/Space as well as hover — this product's governing device has
 * no pointer. In `truncate` mode the tip only repeats text already on screen, so
 * the trigger stays inert and out of the tab order.
 */
export function HoverTip({
  text = '',
  content,
  children,
  className,
  tipClassName,
  theme = 'command',
  mode = 'truncate',
}: HoverTipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipId = useId()
  const [open, setOpen] = useState(false)
  // True when the tip was opened deliberately (tap / Enter) rather than by hover,
  // so a passing pointer cannot dismiss what the user asked to see.
  const [pinned, setPinned] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const hasTip = Boolean(content) || Boolean(text.trim() && text !== '—')
  // Only informational tips earn a tab stop; truncation tips repeat visible text.
  const interactive = hasTip && mode === 'always'

  function isTruncated() {
    const el = triggerRef.current
    if (!el) return false
    return el.scrollWidth > el.clientWidth + 1
  }

  function place() {
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return

    const rect = trigger.getBoundingClientRect()
    const tipWidth = tip.offsetWidth
    const tipHeight = tip.offsetHeight
    const spaceBelow = window.innerHeight - rect.bottom
    const openAbove = spaceBelow < tipHeight + VIEWPORT_PAD && rect.top > spaceBelow

    const top = openAbove ? rect.top - tipHeight - 6 : rect.bottom + 6
    const preferredLeft = rect.left + rect.width / 2 - tipWidth / 2
    const left = Math.min(
      Math.max(VIEWPORT_PAD, preferredLeft),
      window.innerWidth - tipWidth - VIEWPORT_PAD,
    )
    setCoords({ top, left })
  }

  function openTip() {
    if (!hasTip) return
    if (mode === 'truncate' && !isTruncated()) return
    setOpen(true)
  }

  function closeTip() {
    setOpen(false)
    setPinned(false)
    setCoords(null)
  }

  function closeOnPointerLeave() {
    if (pinned) return
    closeTip()
  }

  function toggleTip() {
    if (pinned) {
      closeTip()
      return
    }
    if (!hasTip) return
    setPinned(true)
    setOpen(true)
  }

  // These triggers are frequently nested inside a larger control (an event card
  // is itself a button), so activating the tip must not also activate the card.
  function onTriggerClick(event: ReactMouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    toggleTip()
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      toggleTip()
      return
    }
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      closeTip()
    }
  }

  // Touch and keyboard dismissal. Hover mode closes itself on pointer-leave, but
  // a tip opened by tap or Enter has no leave event to rely on.
  useEffect(() => {
    if (!open || !pinned) return

    function onDocPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (tipRef.current?.contains(target)) return
      closeTip()
    }
    function onDocKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeTip()
    }

    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [open, pinned])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, text, content])

  return (
    <>
      <span
        ref={triggerRef}
        className={className}
        aria-describedby={open ? tipId : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? open : undefined}
        onPointerEnter={openTip}
        onPointerLeave={interactive ? closeOnPointerLeave : closeTip}
        onFocus={openTip}
        onBlur={closeTip}
        onClick={interactive ? onTriggerClick : undefined}
        onKeyDown={interactive ? onTriggerKeyDown : undefined}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={tipRef}
              id={tipId}
              role="tooltip"
              data-theme={theme}
              className={['hover-tip', tipClassName].filter(Boolean).join(' ')}
              style={
                coords
                  ? { top: coords.top, left: coords.left, visibility: 'visible' }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
            >
              {content ?? text}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
