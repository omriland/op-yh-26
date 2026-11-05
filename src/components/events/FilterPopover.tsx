import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useIsDesktop } from '../../lib/useMediaQuery'
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
 * click outside or Escape (focus returns to the trigger). Below 1025 px it is
 * the existing bottom sheet. Arrow keys move between menu items, and from a
 * `data-menu-filter` input into the list.
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
  const isDesktop = useIsDesktop()
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

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return
    const root = bodyRef.current
    if (!root) return
    const items = [...root.querySelectorAll<HTMLElement>(ITEMS)]
    const active = document.activeElement as HTMLElement | null
    const filter = root.querySelector<HTMLElement>('[data-menu-filter]')
    if (event.key === 'Enter') {
      if (active === filter && items[0]) {
        event.preventDefault()
        items[0].click()
      }
      return
    }
    if (items.length === 0) return
    event.preventDefault()
    const index = active ? items.indexOf(active) : -1
    if (event.key === 'ArrowDown') {
      items[Math.min(index + 1, items.length - 1)]?.focus()
    } else if (index <= 0 && filter) {
      filter.focus()
    } else {
      items[Math.max(index - 1, 0)]?.focus()
    }
  }

  const body = (
    <div ref={bodyRef} className={isDesktop ? 'fpop__body' : 'fpop__body fpop__body--sheet'} onKeyDown={onKeyDown}>
      {children}
    </div>
  )

  return (
    <div ref={anchorRef} className="fpop-anchor">
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
