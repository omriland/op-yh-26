/** Ignore the click that focuses the window, and the one that follows it. */
export const DIALOG_FOCUS_DISMISS_GRACE_MS = 500

/**
 * Backdrop dismissal is a completed press on the dimmed layer.
 * Switching Chrome tabs (or clicking back into the window) can deliver a
 * click onto that layer and close a form the user did not dismiss.
 */
export function shouldDismissDialogBackdrop(input: {
  pointerDownOnBackdrop: boolean
  clickTargetIsBackdrop: boolean
  documentVisible: boolean
  millisSinceWindowFocus: number
  focusGraceMs?: number
}): boolean {
  if (!input.documentVisible) return false
  if (!input.pointerDownOnBackdrop || !input.clickTargetIsBackdrop) return false
  const grace = input.focusGraceMs ?? DIALOG_FOCUS_DISMISS_GRACE_MS
  if (input.millisSinceWindowFocus < grace) return false
  return true
}

/**
 * Escape inside an open SelectField menu (a listbox in a form dialog) closes
 * that menu, not the dialog. The dialog listens in capture phase, so it checks.
 */
export function escapeBelongsToPopup(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null
  if (!element || typeof element.closest !== 'function') return false
  return Boolean(
    element.closest('[role="listbox"], .select-field__menu, [aria-expanded="true"]'),
  )
}
