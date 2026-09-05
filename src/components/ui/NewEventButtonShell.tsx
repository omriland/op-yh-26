import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/** Matches `--radius-sm` so the traveling highlight follows the button corner. */
const BORDER_RADIUS_PX = 4
const HIGHLIGHT_SIZE_PX = 20

/** Traveling accent highlight along the button edge (outline-border demo). */
export function CreateEventBorder() {
  const reduceMotion = useReducedMotion()

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
  return (
    <div
      className={[
        'create-event-btn',
        block ? 'create-event-btn--block' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <CreateEventBorder />
      {children}
    </div>
  )
}
