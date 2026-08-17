import { fieldsMatchQuery } from './searchQuery'

export type MineInboxTab = 'pending' | 'logged'

export const MINE_PENDING_TAB_LABEL = 'ממתינים לתיעוד'
export const MINE_LOGGED_TAB_LABEL = 'תועדו'

export const MINE_PENDING_EMPTY_TITLE = 'אין אירועים שממתינים לתיעוד.'
export const MINE_PENDING_EMPTY_CAPTION = 'אירוע חדש יופיע כאן כשישויך אליך.'
export const MINE_PENDING_EMPTY_VIEW_LOGGED = 'לצפייה באירועים שתועדו'
export const MINE_LOGGED_EMPTY_TITLE = 'אין אירועים שתועדו בתקופה זו'

export function openMineSummary(count: number, ready: boolean): string {
  if (!ready) return 'טוען את הדיווחים שלך…'
  if (count === 0) return 'אין אירועים שממתינים לתיעוד.'
  if (count === 1) return 'יש לך אירוע אחד לתעד.'
  if (count === 2) return 'יש לך שני אירועים לתעד.'
  return `יש לך ${count} אירועים לתעד.`
}

export function minePendingTabLabel(count: number): string {
  return count > 0 ? `${MINE_PENDING_TAB_LABEL} ${count}` : MINE_PENDING_TAB_LABEL
}

export function mineLoggedNoResultsTitle(query: string): string {
  return `אין אירועים שתועדו התואמים ל־“${query}”`
}

export function shiftGroupShouldStartOpen(pendingCount: number): boolean {
  return pendingCount > 0
}

export function shiftGroupPendingCaption(count: number): string {
  if (count === 1) return 'אירוע אחד לתעד'
  return `${count} לתעד`
}

export function mineEventMatchesQuery(
  event: {
    police_event_id?: string | null
    road?: { name: string } | null
    location?: string | null
  },
  query: string,
): boolean {
  return fieldsMatchQuery(
    [event.police_event_id, event.road?.name, event.location],
    query,
  )
}
