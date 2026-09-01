export const SELECT_MENU_GAP = 4
export const SELECT_MENU_PAD = 8
export const SELECT_MENU_MIN_HEIGHT = 120
export const SELECT_MENU_MAX_HEIGHT = 280
export const SELECT_MENU_SEARCH_MAX_HEIGHT = 360
export const SELECT_MENU_SEARCH_MIN_WIDTH = 280

type PlaceSelectMenuInput = {
  trigger: { top: number; bottom: number; left: number; right: number }
  viewport: { width: number; height: number; offsetLeft?: number; offsetTop?: number }
  searchable: boolean
  rtl: boolean
}

export type SelectMenuCoords = {
  top: number
  left: number
  width: number
  maxHeight: number
}

/**
 * Place a portaled select menu in visual-viewport coordinates (position:fixed).
 * Searchable menus get a minimum width so חיפוש כביש is not clipped on a half-column.
 */
export function placeSelectMenu(input: PlaceSelectMenuInput): SelectMenuCoords {
  const pad = SELECT_MENU_PAD
  const gap = SELECT_MENU_GAP
  const offsetLeft = input.viewport.offsetLeft ?? 0
  const offsetTop = input.viewport.offsetTop ?? 0

  const visLeft = input.trigger.left - offsetLeft
  const visRight = input.trigger.right - offsetLeft
  const visTop = input.trigger.top - offsetTop
  const visBottom = input.trigger.bottom - offsetTop
  const triggerWidth = Math.max(0, visRight - visLeft)

  const availableWidth = Math.max(1, input.viewport.width - pad * 2)
  const minSearchWidth = Math.min(SELECT_MENU_SEARCH_MIN_WIDTH, availableWidth)
  const width = input.searchable
    ? Math.min(availableWidth, Math.max(triggerWidth, minSearchWidth))
    : Math.min(availableWidth, Math.max(1, triggerWidth))

  const preferredLeft = input.rtl ? visRight - width : visLeft
  const maxLeft = Math.max(pad, input.viewport.width - width - pad)
  const left = Math.min(Math.max(pad, preferredLeft), maxLeft)

  const cap = input.searchable ? SELECT_MENU_SEARCH_MAX_HEIGHT : SELECT_MENU_MAX_HEIGHT
  const spaceBelow = input.viewport.height - visBottom - gap - pad
  const spaceAbove = visTop - gap - pad
  const openUp = spaceBelow < SELECT_MENU_MIN_HEIGHT && spaceAbove > spaceBelow
  const available = Math.max(openUp ? spaceAbove : spaceBelow, SELECT_MENU_MIN_HEIGHT)
  const maxHeight = Math.min(cap, available)
  const unclampedTop = openUp ? visTop - gap - maxHeight : visBottom + gap
  const top = Math.min(
    Math.max(pad, unclampedTop),
    Math.max(pad, input.viewport.height - maxHeight - pad),
  )

  return { top, left, width, maxHeight }
}

export function readSelectMenuViewport(): PlaceSelectMenuInput['viewport'] {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0,
  }
}
