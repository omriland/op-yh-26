export function sidebarCreateAction(
  view: string,
  onCreateEvent?: () => void,
  onCreateShift?: () => void,
): { onCreate: () => void; label: string } | null {
  if (view === 'events' && onCreateEvent) {
    return { onCreate: onCreateEvent, label: 'אירוע חדש' }
  }
  if (view === 'shifts' && onCreateShift) {
    return { onCreate: onCreateShift, label: 'משמרת חדשה' }
  }
  return null
}
