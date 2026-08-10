export type PlatformProbe = {
  platform?: string
  userAgent?: string
}

export type ShortcutKeyEvent = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
}

export type ModalLike = {
  contains: (node: Node | null) => boolean
}

/** Mac / iOS — used only for chord label + Meta vs Ctrl. Desktop gate is separate. */
export function isApplePlatform(probe: PlatformProbe = navigator): boolean {
  const platform = (probe.platform ?? '').toLowerCase()
  if (platform.includes('mac') || platform.includes('iphone') || platform.includes('ipad')) {
    return true
  }
  const ua = (probe.userAgent ?? '').toLowerCase()
  return /macintosh|mac os x/.test(ua)
}

export function isDesktopSubmitShortcut(
  event: ShortcutKeyEvent,
  options: { apple: boolean },
): boolean {
  if (event.key !== 'Enter') return false
  if (options.apple) return event.metaKey && !event.ctrlKey
  return event.ctrlKey && !event.metaKey
}

export function submitShortcutKeys(apple: boolean): { mod: string; key: string } {
  return apple ? { mod: '⌘', key: 'Enter' } : { mod: 'Ctrl', key: 'Enter' }
}

/**
 * Page-level shortcuts must not fire while a modal is open, unless the
 * registered root lives inside that modal (edit/create form dialogs).
 */
export function isBlockedByForeignModal(
  root: Node | null,
  modal: ModalLike | null,
): boolean {
  if (!modal) return false
  if (!root) return true
  return !modal.contains(root)
}
