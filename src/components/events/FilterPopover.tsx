import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { Dialog } from '../ui/Dialog'

type FilterPopoverProps = {
  open: boolean
  onClose: () => void
  /** Sheet title on phones; the popover's accessible name on desktop. */
  title: string
  kind?: 'dialog' | 'menu'
  wide?: boolean
  trigger: ReactNode
  children: ReactNode
  className?: string
}

const ITEMS = '[role^="menuitem"]:not(:disabled), [role="option"]:not(:disabled)'

/**
 * One toolbar menu or panel. Desktop: anchored under its trigger, closed by a
 * click outside, Escape (focus returns to the trigger) or tabbing out. Below 768 px it is
 * the existing bottom sheet. Arrow keys move between menu items.
 */
export function FilterPopover({
  open,
  onClose,
  title,
  kind = 'dialog',
  wide = false,
  trigger,
  children,
  className = '',
}: FilterPopoverProps) {
  // Popovers from 768 px, as the reference; the bottom sheet below that.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const anchorRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || !isDesktop) return
    const onDown = (event: MouseEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return
      onCloseRef.current()
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onCloseRef.current()
      anchorRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, isDesktop])

  // First field or item takes focus; the sheet's own focus (its close X) runs first, so wait a tick.
  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      const root = bodyRef.current
      const target =
        root?.querySelector<HTMLElement>('[data-autofocus]') ??
        root?.querySelector<HTMLElement>('input:not([type="hidden"]):not([tabindex="-1"])') ??
        root?.querySelector<HTMLElement>(ITEMS) ??
        root?.querySelector<HTMLElement>('button')
      target?.focus({ preventScroll: !isDesktop })
      if (target && !isDesktop) target.scrollIntoView({ block: 'nearest' })
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open, isDesktop])

  // Keep the panel on screen: it opens toward inline-end, and flips when that edge runs out.
  useLayoutEffect(() => {
    const pop = popRef.current
    if (!open || !isDesktop || !pop) return
    pop.classList.remove('fpop--flip')
    const rect = pop.getBoundingClientRect()
    if (rect.left < 8 || rect.right > window.innerWidth - 8) pop.classList.add('fpop--flip')
  }, [open, isDesktop])

  // Tab out of the panel and its pill closes it. A click elsewhere is the mousedown handler's.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!open || !isDesktop) return
    const next = event.relatedTarget as Node | null
    if (next && !anchorRef.current?.contains(next)) onCloseRef.current()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [...(bodyRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[Math.min(Math.max(index + step, 0), items.length - 1)]?.focus()
  }

  const body = (
    <div ref={bodyRef} className={isDesktop ? 'fpop__body' : 'fpop__body fpop__body--sheet'} onKeyDown={onKeyDown}>
      {children}
    </div>
  )

  return (
    <div ref={anchorRef} className="fpop-anchor" onBlur={onBlur}>
      {trigger}
      {open && isDesktop ? (
        <div
          ref={popRef}
          className={['fpop', wide ? 'fpop--wide' : '', className].filter(Boolean).join(' ')}
          role={kind}
          aria-label={title}
        >
          {body}
        </div>
      ) : null}
      {!isDesktop ? (
        <Dialog open={open} title={title} onClose={onClose}>
          <div role={kind === 'menu' ? 'menu' : undefined} aria-label={kind === 'menu' ? title : undefined}>
            {body}
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
