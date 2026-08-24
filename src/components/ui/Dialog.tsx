import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useIsDesktop } from '../../lib/useMediaQuery'

type DialogProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Wider form dialog (640 on desktop). */
  form?: boolean
  /** Event-media viewer: `--content-max` on desktop. */
  wide?: boolean
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  form = false,
  wide = false,
}: DialogProps) {
  const isDesktop = useIsDesktop()
  // Unique per instance: a hardcoded id makes aria-labelledby ambiguous the moment
  // two dialogs are mounted at once.
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  /**
   * `aria-modal="true"` is a promise about behavior. Without a trap it is a lie to
   * assistive tech, so the focus management below is what makes the attribute true:
   * focus enters on open, Tab cycles inside, Escape closes, focus returns to the
   * control that opened it — 08-accessibility.md.
   */
  useEffect(() => {
    if (!open) return

    restoreTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const node = dialogRef.current
    const first = node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const scope = dialogRef.current
      if (!scope) return
      const focusable = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1]
      if (document.activeElement === edge) {
        event.preventDefault()
        ;(event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus()
        return
      }
      if (!scope.contains(document.activeElement)) {
        event.preventDefault()
        focusable[0].focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-root" role="presentation">
      {/* Backdrop dismissal stays available to pointers but leaves the tab order to
          the dialog's own controls, which the close button already covers. */}
      <div className="dialog-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={[
          'dialog',
          form ? 'dialog--form' : '',
          wide ? 'dialog--wide' : '',
          isDesktop ? 'dialog--desktop' : 'dialog--sheet',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {!isDesktop ? <div className="dialog__handle" aria-hidden="true" /> : null}
        <header className="dialog__header">
          <h2 id={titleId} className="t-section">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="סגירה" onClick={onClose}>
            <X size={20} strokeWidth={1.75} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
