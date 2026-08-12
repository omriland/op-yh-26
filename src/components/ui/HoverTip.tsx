import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type HoverTipProps = {
  /** Plain-text tip body. Ignored when `content` is set. */
  text?: string
  /** Rich tip body (lists, etc.). */
  content?: ReactNode
  children: ReactNode
  className?: string
  /**
   * `truncate` (default): only when the trigger overflows.
   * `always`: whenever tip text/content is present.
   */
  mode?: 'truncate' | 'always'
}

const VIEWPORT_PAD = 8

/**
 * Instant hover tip (no delay). Command overlay chrome — same family as menus/toasts.
 */
export function HoverTip({
  text = '',
  content,
  children,
  className,
  mode = 'truncate',
}: HoverTipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipId = useId()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const hasTip = Boolean(content) || Boolean(text.trim() && text !== '—')

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
    setCoords(null)
  }

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
        onPointerEnter={openTip}
        onPointerLeave={closeTip}
        onFocus={openTip}
        onBlur={closeTip}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={tipRef}
              id={tipId}
              role="tooltip"
              data-theme="command"
              className="hover-tip"
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
