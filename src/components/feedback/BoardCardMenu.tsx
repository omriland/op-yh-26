import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react'
import type { BoardAssignChoice, BoardCardMenuEntry, BoardCardMenuKey } from '../../lib/feedbackBoard'
import { OVERFLOW_MENU_MIN_WIDTH, placeOverflowMenuPanel } from '../../lib/overflowMenuPlacement'

type BoardCardMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  entries: BoardCardMenuEntry[]
  assignChoices: BoardAssignChoice[]
  onSelect: (key: Exclude<BoardCardMenuKey, 'assign'>) => void
  onAssign: (assigneeId: string | null) => void
}

const PANEL_WIDTH = 220

/**
 * The card's ⋮ menu with a שיוך submenu. Local to the board so the shared
 * OverflowMenu (four other pages) is untouched. The submenu replaces the panel
 * (a drill-down with a back row) instead of flying out: it stays on screen at
 * any width and needs no second placement. RTL keys: ArrowLeft opens שיוך,
 * ArrowRight or Escape goes back to it.
 */
export function BoardCardMenu({
  open,
  onOpenChange,
  label,
  entries,
  assignChoices,
  onSelect,
  onAssign,
}: BoardCardMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [level, setLevel] = useState<'main' | 'assign'>('main')
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  /** Where focus lands after the panel (re)renders: the first item, or שיוך after going back. */
  const focusTarget = useRef<'first' | 'assign'>('first')

  useEffect(() => {
    if (!open) setLevel('main')
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null)
      return
    }
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setCoords(
        placeOverflowMenuPanel({
          trigger: { top: rect.top, bottom: rect.bottom, right: rect.right },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          panelHeight: panelRef.current?.scrollHeight ?? 320,
          minWidth: Math.max(PANEL_WIDTH, OVERFLOW_MENU_MIN_WIDTH),
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
  }, [open, level])

  const placed = coords !== null
  useEffect(() => {
    if (!open || !placed) return
    const panel = panelRef.current
    if (!panel) return
    const target =
      focusTarget.current === 'assign'
        ? panel.querySelector<HTMLElement>('[data-menu-key="assign"]')
        : panel.querySelector<HTMLElement>(
            level === 'assign' ? '[role="menuitemradio"]:not(:disabled)' : '[role^="menuitem"]:not(:disabled)',
          )
    target?.focus()
    focusTarget.current = 'first'
  }, [open, placed, level])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onOpenChange])

  function close() {
    onOpenChange(false)
    triggerRef.current?.focus()
  }

  function back() {
    focusTarget.current = 'assign'
    setLevel('main')
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? []),
    ]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const focused = document.activeElement as HTMLElement | null
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        if (items.length === 0) return
        const step = event.key === 'ArrowDown' ? 1 : -1
        items[(at + step + items.length) % items.length].focus()
        return
      }
      case 'Home':
      case 'End':
        event.preventDefault()
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
        return
      case 'ArrowLeft':
        if (level === 'main' && focused?.dataset.menuKey === 'assign') {
          event.preventDefault()
          setLevel('assign')
        }
        return
      case 'ArrowRight':
        if (level === 'assign') {
          event.preventDefault()
          back()
        }
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        if (level === 'assign') back()
        else close()
        return
      case 'Tab':
        event.preventDefault()
        close()
        return
    }
  }

  return (
    <div className="overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation()
          onOpenChange(!open)
        }}
      >
        <MoreVertical size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              className="overflow-menu__panel overflow-menu__panel--portal board-menu"
              role="menu"
              aria-label={level === 'assign' ? 'שיוך' : label}
              style={
                coords
                  ? { top: coords.top, left: coords.left, maxHeight: coords.maxHeight }
                  : { visibility: 'hidden', top: 0, left: 0 }
              }
              onKeyDown={onKeyDown}
            >
              {level === 'main'
                ? entries.map((entry) =>
                    entry.key === 'assign' ? (
                      <button
                        key={entry.key}
                        type="button"
                        role="menuitem"
                        data-menu-key="assign"
                        aria-haspopup="menu"
                        aria-expanded={false}
                        className="board-menu__sub"
                        onClick={() => setLevel('assign')}
                      >
                        <span>{entry.label}</span>
                        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        key={entry.key}
                        type="button"
                        role="menuitem"
                        data-menu-key={entry.key}
                        className={entry.key === 'delete' ? 'is-danger board-menu__danger' : undefined}
                        disabled={entry.disabled}
                        onClick={() => {
                          if (entry.disabled) return
                          close()
                          onSelect(entry.key as Exclude<BoardCardMenuKey, 'assign'>)
                        }}
                      >
                        {entry.label}
                      </button>
                    ),
                  )
                : (
                    <>
                      <button type="button" role="menuitem" className="board-menu__back" onClick={back}>
                        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
                        <span>חזרה</span>
                      </button>
                      {assignChoices.map((choice) => (
                        <button
                          key={choice.id ?? 'none'}
                          type="button"
                          role="menuitemradio"
                          aria-checked={choice.checked}
                          disabled={choice.disabled}
                          className="board-menu__choice"
                          onClick={() => {
                            if (choice.disabled) return
                            close()
                            if (!choice.checked) onAssign(choice.id)
                          }}
                        >
                          <span>{choice.label}</span>
                          {choice.checked ? <Check size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
                        </button>
                      ))}
                    </>
                  )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
