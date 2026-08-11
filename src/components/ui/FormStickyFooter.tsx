import { useRef, type ReactNode } from 'react'
import { useStickyFooterScrollCue } from '../../lib/stickyFooterScrollCue'

type FormStickyFooterProps = {
  children: ReactNode
}

/** Sticky form action bar with overflow scroll shadow when the page is taller than the viewport. */
export function FormStickyFooter({ children }: FormStickyFooterProps) {
  const ref = useRef<HTMLElement>(null)
  const showCue = useStickyFooterScrollCue(ref)

  return (
    <footer
      ref={ref}
      className={['event-form__footer', showCue ? 'event-form__footer--scroll-cue' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </footer>
  )
}
