import { useEffect, useState, type RefObject } from 'react'

/** True when scrollable content is taller than the visible scrollport. */
export function contentOverflowsScrollport(
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight > clientHeight
}

/**
 * Whether the sticky form footer should show the upward scroll cue.
 * Stays true while the document overflows — including when scrolled to the end.
 */
export function useStickyFooterScrollCue(
  footerRef: RefObject<HTMLElement | null>,
): boolean {
  const [showCue, setShowCue] = useState(false)

  useEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const panel =
      (footer.closest('.event-form__panel') as HTMLElement | null) ?? footer

    const measure = () => {
      const root = document.documentElement
      setShowCue(contentOverflowsScrollport(root.scrollHeight, root.clientHeight))
    }

    measure()
    const frame = requestAnimationFrame(measure)

    const observer = new ResizeObserver(measure)
    observer.observe(panel)

    window.addEventListener('resize', measure)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [footerRef])

  return showCue
}
