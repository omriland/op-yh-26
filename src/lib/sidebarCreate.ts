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

export function sidebarCreateAction(
  view: string,
  onCreateShift?: () => void,
): { onCreate: () => void; label: string } | null {
  if (view === 'shifts' && onCreateShift) {
    return { onCreate: onCreateShift, label: 'משמרת חדשה' }
  }
  return null
}
