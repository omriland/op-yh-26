import { isApplePlatform, submitShortcutKeys } from '../../lib/desktopFormSubmit'
import { useIsDesktop } from '../../lib/useMediaQuery'

/**
 * Small desktop-only caption under primary submit actions.
 * Mac → ⌘ + Enter; Windows/Linux → Ctrl + Enter.
 */
export function SubmitShortcutHint() {
  const isDesktop = useIsDesktop()
  if (!isDesktop) return null

  const { mod, key } = submitShortcutKeys(isApplePlatform())

  return (
    <p className="submit-shortcut-hint t-caption text-muted" aria-hidden="true">
      <span className="submit-shortcut-hint__label">לשמירה מהירה</span>
      <span className="submit-shortcut-hint__keys" dir="ltr">
        <kbd className="submit-shortcut-hint__kbd">{mod}</kbd>
        <span className="submit-shortcut-hint__plus">+</span>
        <kbd className="submit-shortcut-hint__kbd">{key}</kbd>
      </span>
    </p>
  )
}
