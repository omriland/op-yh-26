import type { ReactNode } from 'react'
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
}

export function Dialog({ open, title, onClose, children, footer, form = false }: DialogProps) {
  const isDesktop = useIsDesktop()

  if (!open) return null

  return (
    <div className="dialog-root" role="presentation">
      <button type="button" className="dialog-backdrop" aria-label="סגירה" onClick={onClose} />
      <div
        className={[
          'dialog',
          form ? 'dialog--form' : '',
          isDesktop ? 'dialog--desktop' : 'dialog--sheet',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {!isDesktop ? <div className="dialog__handle" aria-hidden="true" /> : null}
        <header className="dialog__header">
          <h2 id="dialog-title" className="t-section">
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
