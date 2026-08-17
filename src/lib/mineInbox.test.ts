import { describe, expect, it } from 'vitest'
import {
  MINE_LOGGED_EMPTY_TITLE,
  MINE_LOGGED_TAB_LABEL,
  MINE_PENDING_EMPTY_CAPTION,
  MINE_PENDING_EMPTY_TITLE,
  MINE_PENDING_EMPTY_VIEW_LOGGED,
  mineEventMatchesQuery,
  mineLoggedNoResultsTitle,
  minePendingTabLabel,
  openMineSummary,
  shiftGroupPendingCaption,
  shiftGroupShouldStartOpen,
} from './mineInbox'

describe('openMineSummary', () => {
  it('states how many events wait to be logged', () => {
    expect(openMineSummary(0, true)).toBe('אין אירועים שממתינים לתיעוד.')
    expect(openMineSummary(1, true)).toBe('יש לך אירוע אחד לתעד.')
    expect(openMineSummary(2, true)).toBe('יש לך שני אירועים לתעד.')
    expect(openMineSummary(3, true)).toBe('יש לך 3 אירועים לתעד.')
  })

  it('does not claim an empty inbox while the list is still loading', () => {
    expect(openMineSummary(0, false)).toBe('טוען את הדיווחים שלך…')
  })
})

describe('mine inbox tabs', () => {
  it('puts the open count on ממתינים לתיעוד only when there is work', () => {
    expect(minePendingTabLabel(0)).toBe('ממתינים לתיעוד')
    expect(minePendingTabLabel(3)).toBe('ממתינים לתיעוד 3')
  })

  it('keeps the archive tab as תועדו', () => {
    expect(MINE_LOGGED_TAB_LABEL).toBe('תועדו')
  })
})

describe('pending empty copy', () => {
  it('is official-record tone with no celebration', () => {
    expect(MINE_PENDING_EMPTY_TITLE).toBe('אין אירועים שממתינים לתיעוד.')
    expect(MINE_PENDING_EMPTY_CAPTION).toBe('אירוע חדש יופיע כאן כשישויך אליך.')
    expect(MINE_PENDING_EMPTY_VIEW_LOGGED).toBe('לצפייה באירועים שתועדו')
    expect(MINE_PENDING_EMPTY_TITLE).not.toMatch(/!/)
  })
})

describe('logged empty copy', () => {
  it('names the window when nothing is in it', () => {
    expect(MINE_LOGGED_EMPTY_TITLE).toBe('אין אירועים שתועדו בתקופה זו')
  })

  it('names the query when search misses', () => {
    expect(mineLoggedNoResultsTitle('6')).toBe('אין אירועים שתועדו התואמים ל־“6”')
  })
})

describe('shift group on the inbox tab', () => {
  it('starts open when any event still needs logging', () => {
    expect(shiftGroupShouldStartOpen(2)).toBe(true)
    expect(shiftGroupShouldStartOpen(0)).toBe(false)
  })

  it('captions the open count, not the total event count', () => {
    expect(shiftGroupPendingCaption(1)).toBe('אירוע אחד לתעד')
    expect(shiftGroupPendingCaption(2)).toBe('2 לתעד')
  })
})

describe('mineEventMatchesQuery', () => {
  it('matches police id, road, or location', () => {
    const event = {
      police_event_id: '12345',
      road: { name: 'כביש 6' },
      location: 'מחלף אייל',
    }
    expect(mineEventMatchesQuery(event, '123')).toBe(true)
    expect(mineEventMatchesQuery(event, 'אייל')).toBe(true)
    expect(mineEventMatchesQuery(event, '6')).toBe(true)
    expect(mineEventMatchesQuery(event, 'חיפה')).toBe(false)
  })
})
