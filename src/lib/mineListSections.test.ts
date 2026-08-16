import { describe, expect, it } from 'vitest'
import {
  MINE_LOGGED_WINDOW_DAYS,
  addCalendarDays,
  loggedWindowStart,
  partitionMineList,
} from './mineListSections'

describe('addCalendarDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addCalendarDays('2026-08-16', -30)).toBe('2026-07-17')
    expect(addCalendarDays('2026-01-05', -10)).toBe('2025-12-26')
  })
})

describe('loggedWindowStart', () => {
  it('looks back 30 days per loaded window', () => {
    expect(loggedWindowStart('2026-08-16', 1)).toBe('2026-07-17')
    expect(loggedWindowStart('2026-08-16', 2)).toBe('2026-06-17')
  })

  it('treats a missing window count as one window', () => {
    expect(loggedWindowStart('2026-08-16', 0)).toBe('2026-07-17')
  })
})

describe('partitionMineList', () => {
  const today = '2026-08-16'

  it('keeps pending items of any age and windows logged items', () => {
    const items = [
      { id: 'old-pending', date: '2026-05-01', bucket: 'pending' as const },
      { id: 'recent-logged', date: '2026-08-10', bucket: 'logged' as const },
      { id: 'old-logged', date: '2026-06-20', bucket: 'logged' as const },
      { id: 'today-logged', date: '2026-08-16', bucket: 'logged' as const },
    ]

    const first = partitionMineList(items, {
      dateOf: (item) => item.date,
      bucket: (item) => item.bucket,
      today,
      windowsLoaded: 1,
    })

    expect(first.pending.map((item) => item.id)).toEqual(['old-pending'])
    expect(first.logged.map((item) => item.id)).toEqual(['today-logged', 'recent-logged'])
    expect(first.hasMoreLogged).toBe(true)

    const second = partitionMineList(items, {
      dateOf: (item) => item.date,
      bucket: (item) => item.bucket,
      today,
      windowsLoaded: 2,
    })
    expect(second.logged.map((item) => item.id)).toEqual([
      'today-logged',
      'recent-logged',
      'old-logged',
    ])
    expect(second.hasMoreLogged).toBe(false)
  })

  it('sorts future soonest-first and hides none of them behind the window', () => {
    const items = [
      { id: 'later', date: '2026-09-01', bucket: 'future' as const },
      { id: 'sooner', date: '2026-08-20', bucket: 'future' as const },
    ]

    const result = partitionMineList(items, {
      dateOf: (item) => item.date,
      bucket: (item) => item.bucket,
      today,
      windowsLoaded: 1,
    })

    expect(result.future.map((item) => item.id)).toEqual(['sooner', 'later'])
    expect(result.logged).toEqual([])
    expect(result.hasMoreLogged).toBe(false)
  })

  it('returns empty pending without dropping the bucket', () => {
    const result = partitionMineList(
      [{ id: 'done', date: today, bucket: 'logged' as const }],
      {
        dateOf: (item) => item.date,
        bucket: (item) => item.bucket,
        today,
        windowsLoaded: 1,
      },
    )

    expect(result.pending).toEqual([])
    expect(result.logged.map((item) => item.id)).toEqual(['done'])
  })

  it('uses a 30-day window size', () => {
    expect(MINE_LOGGED_WINDOW_DAYS).toBe(30)
  })
})
