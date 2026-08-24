export type OpsMapViewTrigger = 'init' | 'search' | 'focus' | 'data'

export const OPS_MAP_FOCUS_ZOOM = 14

export function opsMapEventFocusTarget(
  eventPins: Array<{ eventId: string; lat: number; lng: number }>,
  focusEventId: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!focusEventId) return null
  const pin = eventPins.find((row) => row.eventId === focusEventId)
  return pin ? { lat: pin.lat, lng: pin.lng } : null
}

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
