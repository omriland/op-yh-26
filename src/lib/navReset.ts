export type NavClickPrev = {
  view: string
  eventSurface: { kind: string; [key: string]: unknown }
  shiftSurface: { kind: string; [key: string]: unknown }
  sectionReset: number
}

/** Clicking a primary nav item always returns that section's root. */
export function applyNavClick<TView extends string>(
  prev: NavClickPrev,
  nextView: TView,
): {
  view: TView
  eventSurface: { kind: 'list' }
  shiftSurface: { kind: 'list' }
  sectionReset: number
} {
  return {
    view: nextView,
    eventSurface: { kind: 'list' },
    shiftSurface: { kind: 'list' },
    sectionReset: prev.sectionReset + 1,
  }
}
