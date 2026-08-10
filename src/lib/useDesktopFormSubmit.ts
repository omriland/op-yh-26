import { useEffect, useRef, type RefObject } from 'react'
import {
  isApplePlatform,
  isBlockedByForeignModal,
  isDesktopSubmitShortcut,
} from './desktopFormSubmit'
import { useIsDesktop } from './useMediaQuery'

type Options = {
  /** When false, listener is inactive (busy, read-only, wrong mode, …). */
  enabled?: boolean
  /**
   * Scope root for modal arbitration. Page forms omit this (blocked while any
   * modal is open). Form dialogs pass a ref inside the dialog.
   */
  rootRef?: RefObject<HTMLElement | null>
}

/**
 * Desktop-only ⌘/Ctrl+Enter → primary form action.
 * Hidden/disabled on mobile via `useIsDesktop`.
 */
export function useDesktopFormSubmit(onSubmit: () => void, options: Options = {}): void {
  const isDesktop = useIsDesktop()
  const enabled = options.enabled !== false
  const onSubmitRef = useRef(onSubmit)
  const rootRef = options.rootRef

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    if (!isDesktop || !enabled) return

    const apple = isApplePlatform()

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isDesktopSubmitShortcut(event, { apple })) return

      // Topmost modal wins when confirm stacks over an edit dialog.
      const modals = document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      )
      const modal = modals.length > 0 ? modals[modals.length - 1]! : null
      const root = rootRef?.current ?? null
      if (isBlockedByForeignModal(root, modal)) return

      event.preventDefault()
      onSubmitRef.current()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isDesktop, enabled, rootRef])
}
