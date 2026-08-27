export const AVAILABILITY_POPOVER_GAP = 4
export const AVAILABILITY_POPOVER_PAD = 8
export const AVAILABILITY_POPOVER_MIN_HEIGHT = 120
export const AVAILABILITY_POPOVER_FALLBACK_WIDTH = 260
export const AVAILABILITY_POPOVER_FALLBACK_HEIGHT = 220

type PlaceAvailabilityPopoverInput = {
  trigger: { top: number; bottom: number; left: number; right: number }
  viewport: { width: number; height: number }
  panel: { width: number; height: number }
  rtl: boolean
}

/** Keep a portaled availability editor inside the viewport (flip + clamp). */
export function placeAvailabilityPopover(input: PlaceAvailabilityPopoverInput): {
  top: number
  left: number
  maxHeight: number
} {
  const pad = AVAILABILITY_POPOVER_PAD
  const gap = AVAILABILITY_POPOVER_GAP
  const panelWidth = Math.max(1, input.panel.width)
  const panelHeight = Math.max(1, input.panel.height)

  const availableBelow = input.viewport.height - input.trigger.bottom - gap - pad
  const availableAbove = input.trigger.top - gap - pad
  const openUp = panelHeight > availableBelow && availableAbove > availableBelow
  const available = Math.max(openUp ? availableAbove : availableBelow, AVAILABILITY_POPOVER_MIN_HEIGHT)
  const maxHeight = Math.min(panelHeight, available)
  const unclampedTop = openUp ? input.trigger.top - gap - maxHeight : input.trigger.bottom + gap
  const top = Math.min(
    Math.max(pad, unclampedTop),
    Math.max(pad, input.viewport.height - maxHeight - pad),
  )

  const preferredLeft = input.rtl
    ? input.trigger.right - panelWidth
    : input.trigger.left
  const maxLeft = Math.max(pad, input.viewport.width - panelWidth - pad)
  const left = Math.min(Math.max(pad, preferredLeft), maxLeft)

  return { top, left, maxHeight }
}
