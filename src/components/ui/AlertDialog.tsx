import { AlertDialog as HeroAlertDialog } from '@heroui/react'
import type { ReactNode } from 'react'
import type { AlertDialogStatus } from '../../lib/alertDialog'

type AlertDialogProps = {
  open: boolean
  title: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  status: AlertDialogStatus
  /** Blocks backdrop / Escape / X while a confirm action is in flight. */
  busy?: boolean
  dir?: 'ltr' | 'rtl'
  lang?: string
  closeLabel?: string
}

export function AlertDialog({
  open,
  title,
  onClose,
  children,
  footer,
  status,
  busy = false,
  dir = 'rtl',
  lang = 'he',
  closeLabel = 'סגירה',
}: AlertDialogProps) {
  return (
    <HeroAlertDialog.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      className="yahpaz-alert-dialog-backdrop"
      dir={dir}
    >
      <HeroAlertDialog.Container placement="auto" size="md">
        <HeroAlertDialog.Dialog
          className={[
            'yahpaz-alert-dialog',
            'light',
            dir === 'rtl' ? 'yahpaz-alert-dialog--rtl' : 'yahpaz-alert-dialog--ltr',
          ].join(' ')}
          dir={dir}
          lang={lang}
          data-theme="light"
          data-vibrant-palette="true"
        >
          {busy ? null : <HeroAlertDialog.CloseTrigger aria-label={closeLabel} />}
          <HeroAlertDialog.Header>
            <HeroAlertDialog.Icon status={status} />
            <HeroAlertDialog.Heading>{title}</HeroAlertDialog.Heading>
          </HeroAlertDialog.Header>
          {children ? <HeroAlertDialog.Body>{children}</HeroAlertDialog.Body> : null}
          {footer ? <HeroAlertDialog.Footer>{footer}</HeroAlertDialog.Footer> : null}
        </HeroAlertDialog.Dialog>
      </HeroAlertDialog.Container>
    </HeroAlertDialog.Backdrop>
  )
}
