import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeContextMenuAtPointer } from '../../lib/overflowMenuPlacement'
import type { OverflowMenuItem } from './OverflowMenu'

type PointerContextMenuProps = {
  open: boolean
  pointer: { x: number; y: number } | null
  items: OverflowMenuItem[]
  onClose: () => void
  label?: string
}

export function PointerContextMenu({
  open,
  pointer,
  items,
  onClose,
  label = 'פעולות',
}: PointerContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !pointer) {
      setCoords(null)
      return
    }

    function place() {
      const panelEl = panelRef.current
      if (!pointer) return
      setCoords(
        placeContextMenuAtPointer({
          pointer,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          panel: {
            width: panelEl?.offsetWidth ?? 180,
            height: panelEl?.offsetHeight ?? 48,
          },
        }),
      )
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, pointer, items.length])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
  }, [open, coords])

  if (!open || !pointer) return null

  const style = coords ?? { top: pointer.y, left: pointer.x }

  return createPortal(
    <div
      ref={panelRef}
      id={menuId}
      className="overflow-menu__panel overflow-menu__panel--portal"
      role="menu"
      aria-label={label}
      style={style}
      onContextMenu={(event) => event.preventDefault()}
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
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
