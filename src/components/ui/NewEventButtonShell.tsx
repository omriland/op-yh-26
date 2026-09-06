import { useState, type FocusEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** Matches `--radius-sm` so the traveling highlight follows the button corner. */
const BORDER_RADIUS_PX = 4
const HIGHLIGHT_SIZE_PX = 20

/** Traveling accent highlight along the button edge — only while the shell is active. */
export function CreateEventBorder({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion()

  if (!active) return null

  return (
    <div className="create-event-btn__border" aria-hidden="true">
      {reduceMotion ? (
        <span className="create-event-btn__border-static" />
      ) : (
        <motion.div
          className="create-event-btn__border-dot"
          animate={{ offsetDistance: ['0%', '100%'] }}
          style={{
            width: HIGHLIGHT_SIZE_PX,
            offsetPath: `rect(0 auto auto 0 round ${BORDER_RADIUS_PX}px)`,
          }}
          transition={{
            repeat: Number.POSITIVE_INFINITY,
            duration: 5,
            ease: 'linear',
          }}
        />
      )}
    </div>
  )
}

/**
 * Animated outline ring for אירוע חדש CTAs.
 * Wraps the existing Button / sidebar nav control — keeps each child's width.
 * The traveling highlight runs only on hover / keyboard focus.
 */
export function NewEventButtonShell({
  children,
  block = false,
  className = '',
}: {
  children: ReactNode
  /** Match a `block` Button — shell stretches to full row width. */
  block?: boolean
  className?: string
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const highlight = hovered || focused

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setFocused(false)
  }

  return (
    <div
      className={[
        'create-event-btn',
        block ? 'create-event-btn--block' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={handleBlur}
    >
      <CreateEventBorder active={highlight} />
      {children}
    </div>
  )
}
