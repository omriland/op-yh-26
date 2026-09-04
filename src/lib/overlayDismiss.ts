/** Clicks that should close a menu. Portaled dialogs stay owned by the opener. */
export function isMenuOutsideClick(target: EventTarget | null, anchor: Node | null): boolean {
  if (!(target instanceof Node)) return false
  if (anchor?.contains(target)) return false
  const el = target instanceof Element ? target : target.parentElement
  if (el?.closest('.dialog-root')) return false
  return true
}
