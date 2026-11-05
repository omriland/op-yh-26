import { useEffect } from 'react'

/** ⌘K / Ctrl+K. `ל` is the K key on the Hebrew layout. */
export function isSearchShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'>,
): boolean {
  if (e.isComposing || e.altKey || e.shiftKey) return false
  if (!e.metaKey && !e.ctrlKey) return false
  const key = e.key.toLowerCase()
  return key === 'k' || key === 'ל'
}

/**
 * Bubble phase on purpose: an open Dialog handling the key in the capture phase wins.
 * An event already handled (defaultPrevented) is ignored.
 */
export function useSearchShortcut(enabled: boolean, open: () => void): void {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || !isSearchShortcut(e)) return
      e.preventDefault()
      open()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, open])
}
