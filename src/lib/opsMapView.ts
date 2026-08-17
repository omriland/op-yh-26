export type OpsMapViewTrigger = 'init' | 'search' | 'focus' | 'data'

export function opsMapViewTrigger(input: {
  initialized: boolean
  originChanged: boolean
  focusChanged: boolean
}): OpsMapViewTrigger {
  if (!input.initialized) return 'init'
  if (input.originChanged) return 'search'
  if (input.focusChanged) return 'focus'
  return 'data'
}

/** Pin refreshes must not steal a viewport the user already panned or zoomed. */
export function shouldRefitOpsMapView(
  trigger: OpsMapViewTrigger,
  userHasMovedMap: boolean,
): boolean {
  if (trigger === 'data') return !userHasMovedMap
  return true
}
