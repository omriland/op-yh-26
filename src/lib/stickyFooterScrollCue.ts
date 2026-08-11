import { useEffect, useState, type RefObject } from 'react'

/** True when scrollable content is taller than the visible scrollport. */
export function contentOverflowsScrollport(
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight > clientHeight
}

type OverflowNode = { overflowY: string }

/**
 * Pure ancestor walk — first node with overflow-y auto/scroll wins.
 * `ancestors` is ordered nearest → farthest (parent chain).
 */
export function findScrollportAncestor<T extends OverflowNode>(
  ancestors: T[],
): T | null {
  for (const node of ancestors) {
    if (node.overflowY === 'auto' || node.overflowY === 'scroll') return node
  }
  return null
}

/** Nearest scrollable ancestor, or the document element. */
export function resolveScrollport(el: HTMLElement): HTMLElement {
  const ancestors: { node: HTMLElement; overflowY: string }[] = []
  let node: HTMLElement | null = el.parentElement
  while (node) {
    ancestors.push({
      node,
      overflowY: getComputedStyle(node).overflowY,
    })
    node = node.parentElement
  }
  return findScrollportAncestor(ancestors)?.node ?? document.documentElement
}

/**
 * Whether the sticky form footer should show the upward scroll cue.
 * Stays true while the scrollport overflows — including when scrolled to the end.
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
      const scrollport = resolveScrollport(footer)
      setShowCue(
        contentOverflowsScrollport(scrollport.scrollHeight, scrollport.clientHeight),
      )
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
