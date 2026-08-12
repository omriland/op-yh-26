import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export type OverflowMenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

type OverflowMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: OverflowMenuItem[]
  label?: string
  /** Optional custom trigger; default is the 3-dot icon button. */
  trigger?: ReactNode
}

const PANEL_MIN_WIDTH = 180

export function OverflowMenu({
  open,
  onOpenChange,
  items,
  label = 'פעולות נוספות',
  trigger,
}: OverflowMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null)
      return
    }

    function place() {
      const triggerEl = triggerRef.current
      const panelEl = panelRef.current
      if (!triggerEl) return

      const rect = triggerEl.getBoundingClientRect()
      const panelHeight = panelEl?.offsetHeight ?? items.length * 48 + 8
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < panelHeight + 8 && rect.top > spaceBelow
      const top = openUp ? rect.top - panelHeight - 4 : rect.bottom + 4
      const left = Math.min(
        Math.max(8, rect.right - PANEL_MIN_WIDTH),
        window.innerWidth - PANEL_MIN_WIDTH - 8,
      )
      setCoords({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, items.length])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      onOpenChange(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div className="overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation()
          onOpenChange(!open)
        }}
      >
        {trigger ?? <MoreVertical size={20} strokeWidth={1.75} />}
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              className="overflow-menu__panel overflow-menu__panel--portal"
              role="menu"
              style={{ top: coords.top, left: coords.left }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={item.danger ? 'is-danger' : undefined}
                  disabled={item.disabled}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (item.disabled) return
                    onOpenChange(false)
                    item.onSelect()
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
