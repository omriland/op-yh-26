export const NAV_FLYOUT_GAP = 4
export const NAV_FLYOUT_PAD = 8
export const NAV_FLYOUT_MIN_WIDTH = 180

export function placeNavFlyout(input: {
  trigger: { top: number; left: number; right: number }
  panelWidth: number
  viewport: { width: number; height: number }
  rtl: boolean
  gap?: number
  pad?: number
}): { top: number; left: number } {
  const gap = input.gap ?? NAV_FLYOUT_GAP
  const pad = input.pad ?? NAV_FLYOUT_PAD
  const width = Math.max(input.panelWidth, NAV_FLYOUT_MIN_WIDTH)
  const towardContent = input.rtl
    ? input.trigger.left - width - gap
    : input.trigger.right + gap
  const left = Math.min(
    Math.max(pad, towardContent),
    Math.max(pad, input.viewport.width - width - pad),
  )
  const top = Math.max(pad, input.trigger.top)

  return { top, left }
}
