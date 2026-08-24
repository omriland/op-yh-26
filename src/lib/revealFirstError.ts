import { useEffect } from 'react'

/**
 * Focus the first invalid control after a failed submit.
 *
 * The forms previously ran `document.querySelector('[aria-invalid="true"]')`
 * synchronously right after `setErrors(...)`, which reads the DOM before React has
 * committed the new state — so on the FIRST failed submit nothing carried the
 * attribute yet and the reveal silently did nothing. Running it from an effect keyed
 * on a submit counter guarantees the attribute is painted, and focusing (not merely
 * scrolling) also carries the field's `role="alert"` text to assistive tech.
 *
 * DOM order is the declared field order, so "first invalid in the document" is the
 * field the user should be sent to.
 */

type FocusTarget = {
  focus: (options?: { preventScroll?: boolean }) => void
  scrollIntoView: (options?: unknown) => void
}

type QueryRoot = {
  querySelector: (selectors: string) => FocusTarget | null
}

export const INVALID_SELECTOR = '[aria-invalid="true"]'

/** Returns true when a control was found and focused. */
export function focusFirstInvalid(root: QueryRoot): boolean {
  const target = root.querySelector(INVALID_SELECTOR)
  if (!target) return false
  // preventScroll so the smooth scroll below owns the movement, rather than the
  // browser's instant jump fighting it.
  target.focus({ preventScroll: true })
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}

/**
 * Reveal the first invalid field whenever `attempt` increases. Pass a counter that
 * you bump on every failed submit, so a repeat submit with identical errors still
 * re-focuses.
 */
export function useRevealFirstError(attempt: number): void {
  useEffect(() => {
    if (attempt <= 0) return
    if (typeof document === 'undefined') return
    focusFirstInvalid(document)
  }, [attempt])
}
