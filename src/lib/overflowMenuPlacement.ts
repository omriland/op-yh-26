export const OVERFLOW_MENU_GAP = 4
export const OVERFLOW_MENU_VIEWPORT_PAD = 8
export const OVERFLOW_MENU_MIN_HEIGHT = 48
export const OVERFLOW_MENU_MIN_WIDTH = 180

type PlaceOverflowMenuInput = {
  trigger: { top: number; bottom: number; right: number }
  viewport: { width: number; height: number }
  panelHeight: number
  minWidth?: number
}

/** Keep a portaled overflow menu inside the viewport and cap height so it can scroll. */
export function placeOverflowMenuPanel(input: PlaceOverflowMenuInput): {
  top: number
  left: number
  maxHeight: number
} {
  const minWidth = input.minWidth ?? OVERFLOW_MENU_MIN_WIDTH
  const pad = OVERFLOW_MENU_VIEWPORT_PAD
  const gap = OVERFLOW_MENU_GAP
  const availableBelow = input.viewport.height - input.trigger.bottom - gap - pad
  const availableAbove = input.trigger.top - gap - pad
  const openUp = input.panelHeight > availableBelow && availableAbove > availableBelow
  const available = Math.max(openUp ? availableAbove : availableBelow, OVERFLOW_MENU_MIN_HEIGHT)
  const maxHeight = Math.min(input.panelHeight, available)
  const top = openUp ? input.trigger.top - gap - maxHeight : input.trigger.bottom + gap
  const left = Math.min(
    Math.max(pad, input.trigger.right - minWidth),
    input.viewport.width - minWidth - pad,
  )

  return {
    top: Math.max(pad, top),
    left,
    maxHeight,
  }
}

/** Keep a pointer-anchored context menu inside the viewport. */
export function placeContextMenuAtPointer(input: {
  pointer: { x: number; y: number }
  viewport: { width: number; height: number }
  panel: { width: number; height: number }
}): { top: number; left: number } {
  const pad = OVERFLOW_MENU_VIEWPORT_PAD
  const left = Math.min(
    Math.max(pad, input.pointer.x),
    Math.max(pad, input.viewport.width - input.panel.width - pad),
  )
  const top = Math.min(
    Math.max(pad, input.pointer.y),
    Math.max(pad, input.viewport.height - input.panel.height - pad),
  )
  return { top, left }
}
