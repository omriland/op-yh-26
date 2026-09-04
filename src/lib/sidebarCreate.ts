export const SHIFT_LEAD_NAV_SECTION = 'כלים לאחמ״ש'

export function sidebarLeadNewEvent(
  section: string | undefined,
  onCreateEvent?: () => void,
): { onCreate: () => void; label: string } | null {
  if (section === SHIFT_LEAD_NAV_SECTION && onCreateEvent) {
    return { onCreate: onCreateEvent, label: 'אירוע חדש' }
  }
  return null
}

/** Create (`/events/new`, including query) — not edit (`/:id/edit`). */
export function isSidebarCreateEventCurrent(surface: {
  kind: string
  eventId?: string
} | null | undefined): boolean {
  return surface?.kind === 'form' && !surface.eventId
}

