import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import { nextMenuIndex } from '../../lib/desktopNav'

/* Desktop shell menus (Help, avatar, rail flyouts) and tooltips. One menu open at a
   time; tooltips never show while a menu is open. */

type ShellMenus = {
  openId: string | null
  setOpenId: Dispatch<SetStateAction<string | null>>
}

const ShellMenuContext = createContext<ShellMenus>({ openId: null, setOpenId: () => {} })

export function ShellMenuProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <ShellMenuContext.Provider value={{ openId, setOpenId }}>{children}</ShellMenuContext.Provider>
  )
}

export function useShellMenus() {
  return useContext(ShellMenuContext)
}

export function isRtlDocument(): boolean {
  return getComputedStyle(document.documentElement).direction === 'rtl'
}

/** Portal inside the shell so tooltips and flyouts keep its scoped tokens. */
export function shellPortalRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('.shell--desktop') ?? document.body
}

// ---------- tooltip ----------

const TOOLTIP_DELAY_MS = 400
const TOOLTIP_GAP_PX = 8
const VIEWPORT_MARGIN_PX = 8

type TooltipPlacement = 'side' | 'below'

function TooltipBubble({
  label,
  rect,
  placement,
}: {
  label: string
  rect: DOMRect
  placement: TooltipPlacement
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const width = el.offsetWidth
    const height = el.offsetHeight
    let top: number
    let left: number
    if (placement === 'side') {
      top = rect.top + rect.height / 2 - height / 2
      left = isRtlDocument() ? rect.left - TOOLTIP_GAP_PX - width : rect.right + TOOLTIP_GAP_PX
    } else {
      top = rect.bottom + TOOLTIP_GAP_PX
      left = rect.left + rect.width / 2 - width / 2
    }
    const maxLeft = window.innerWidth - VIEWPORT_MARGIN_PX - width
    setPos({ top, left: Math.min(Math.max(left, VIEWPORT_MARGIN_PX), maxLeft) })
  }, [rect, placement, label])

  return (
    <div
      ref={ref}
      className="dshell-tooltip"
      role="tooltip"
      aria-hidden="true"
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {label}
    </div>
  )
}

type TooltipTriggerProps = {
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onPointerDown: () => void
  onFocus: (event: ReactFocusEvent<HTMLElement>) => void
  onBlur: () => void
}

/**
 * Shows `label` 400ms after the pointer rests, or at once on keyboard focus. Hides on
 * leave, press, Esc and scroll, and while any shell menu is open. `truncatedOnly` shows
 * it only when the trigger's `.dnav-item__label` is cut off with an ellipsis.
 */
export function useTooltip(
  label: string,
  placement: TooltipPlacement,
  { enabled = true, truncatedOnly = false }: { enabled?: boolean; truncatedOnly?: boolean } = {},
): { triggerProps: TooltipTriggerProps; tooltip: ReactNode } {
  const { openId } = useShellMenus()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const timer = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setRect(null)
  }, [clearTimer])

  const blocked = !enabled || openId !== null

  function show(el: HTMLElement) {
    if (blocked) return
    if (truncatedOnly) {
      const text = el.querySelector<HTMLElement>('.dnav-item__label')
      if (!text || text.scrollWidth <= text.clientWidth) return
    }
    setRect(el.getBoundingClientRect())
  }

  useEffect(() => {
    if (blocked) hide()
  }, [blocked, hide])

  useEffect(() => {
    if (!rect) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('scroll', hide, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', hide, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [rect, hide])

  useEffect(() => clearTimer, [clearTimer])

  return {
    triggerProps: {
      onPointerEnter: (event) => {
        if (event.pointerType !== 'mouse') return
        const el = event.currentTarget
        clearTimer()
        timer.current = window.setTimeout(() => show(el), TOOLTIP_DELAY_MS)
      },
      onPointerLeave: hide,
      onPointerDown: hide,
      onFocus: (event) => {
        if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget)
      },
      onBlur: hide,
    },
    tooltip: rect
      ? createPortal(
          <TooltipBubble label={label} rect={rect} placement={placement} />,
          shellPortalRoot(),
        )
      : null,
  }
}

// ---------- menu controller ----------

type OpenedBy = 'hover' | 'click' | 'key'

const HOVER_CLOSE_MS = 200

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return []
  return Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])'),
  )
}

/**
 * Open state, keyboard (arrows, Home/End, Esc returns focus to the trigger), outside
 * click and hover timing for one shell menu. `containers` are the nodes a click may
 * land in without closing it (the anchor, or the trigger plus a portaled panel).
 */
export function useShellMenu(id: string) {
  const { openId, setOpenId } = useShellMenus()
  const open = openId === id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const openedBy = useRef<OpenedBy>('click')
  const timer = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const show = useCallback(
    (by: OpenedBy) => {
      clearTimer()
      openedBy.current = by
      setOpenId(id)
    },
    [clearTimer, id, setOpenId],
  )

  const hide = useCallback(
    (refocus = false) => {
      clearTimer()
      setOpenId((current) => (current === id ? null : current))
      if (refocus) triggerRef.current?.focus()
    },
    [clearTimer, id, setOpenId],
  )

  useEffect(() => clearTimer, [clearTimer])

  useEffect(() => {
    if (open && openedBy.current === 'key') menuItems(menuRef.current)[0]?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const inside = [anchorRef.current, triggerRef.current, menuRef.current].some((node) =>
        node?.contains(target),
      )
      if (inside) return
      const el = target instanceof Element ? target : target.parentElement
      if (el?.closest('.dialog-root')) return
      hide()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        hide(true)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, hide])

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Tab') {
      hide()
      return
    }
    const items = menuItems(menuRef.current)
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = nextMenuIndex(event.key, current, items.length)
    if (next == null) return
    event.preventDefault()
    items[next]?.focus()
  }

  function onTriggerClick(event: ReactMouseEvent<HTMLButtonElement>) {
    // detail 0: Enter / Space on the button.
    const by: OpenedBy = event.detail === 0 ? 'key' : 'click'
    if (open && openedBy.current !== 'hover') {
      hide()
      return
    }
    show(by)
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      show('key')
    }
  }

  /** Help and avatar: open on hover, close 200ms after the pointer leaves button and menu. */
  const hoverProps = {
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return
      clearTimer()
      if (!open) show('hover')
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return
      if (open && openedBy.current === 'hover') {
        clearTimer()
        timer.current = window.setTimeout(() => hide(), HOVER_CLOSE_MS)
      }
    },
  }

  return {
    open,
    show,
    hide,
    triggerRef,
    menuRef,
    anchorRef,
    hoverProps,
    onMenuKeyDown,
    onTriggerClick,
    onTriggerKeyDown,
  }
}

/** Top bar menu (Help, avatar): opens 40px under its button, aligned to its inline end. */
export function TopBarMenu({
  id,
  label,
  tooltip,
  triggerClassName,
  triggerContent,
  children,
  header,
}: {
  id: string
  /** Accessible name of the trigger and the menu. */
  label: string
  /** Visible tooltip text; omit for no tooltip. */
  tooltip?: string
  triggerClassName: string
  triggerContent: ReactNode
  header?: ReactNode
  children: (close: () => void) => ReactNode
}) {
  const menu = useShellMenu(id)
  const tip = useTooltip(tooltip ?? '', 'below', { enabled: Boolean(tooltip) && !menu.open })
  const menuId = `dshell-menu-${id}`

  return (
    <div className="dshell-menu-anchor" ref={menu.anchorRef} {...menu.hoverProps}>
      <button
        ref={menu.triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        {...tip.triggerProps}
        onClick={menu.onTriggerClick}
        onKeyDown={menu.onTriggerKeyDown}
      >
        {triggerContent}
      </button>
      {tip.tooltip}
      {menu.open ? (
        <div
          ref={menu.menuRef}
          className="dshell-menu dshell-menu--bar"
          onKeyDown={menu.onMenuKeyDown}
        >
          {header}
          <div id={menuId} role="menu" aria-label={label} className="dshell-menu__list">
            {children(() => menu.hide())}
          </div>
        </div>
      ) : null}
    </div>
  )
}
