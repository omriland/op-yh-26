export const MINE_LOGGED_WINDOW_DAYS = 30

/** Add calendar days to a YYYY-MM-DD without local-timezone drift. */
export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function loggedWindowStart(today: string, windowsLoaded: number): string {
  const windows = Math.max(1, windowsLoaded)
  return addCalendarDays(today, -(windows * MINE_LOGGED_WINDOW_DAYS))
}

export type MineListBucket = 'pending' | 'future' | 'logged'

export type MineListSections<T> = {
  pending: T[]
  future: T[]
  logged: T[]
  hasMoreLogged: boolean
}

export function partitionMineList<T>(
  items: T[],
  opts: {
    dateOf: (item: T) => string
    bucket: (item: T) => MineListBucket
    today: string
    windowsLoaded: number
  },
): MineListSections<T> {
  const start = loggedWindowStart(opts.today, opts.windowsLoaded)
  const pending: T[] = []
  const future: T[] = []
  const logged: T[] = []
  let hasMoreLogged = false

  for (const item of items) {
    const bucket = opts.bucket(item)
    if (bucket === 'pending') {
      pending.push(item)
      continue
    }
    if (bucket === 'future') {
      future.push(item)
      continue
    }

    const date = opts.dateOf(item)
    if (date >= start && date <= opts.today) {
      logged.push(item)
    } else if (date < start) {
      hasMoreLogged = true
    }
  }

  return {
    pending: sortByDate(pending, opts.dateOf, 'desc'),
    future: sortByDate(future, opts.dateOf, 'asc'),
    logged: sortByDate(logged, opts.dateOf, 'desc'),
    hasMoreLogged,
  }
}

function sortByDate<T>(
  items: T[],
  dateOf: (item: T) => string,
  direction: 'asc' | 'desc',
): T[] {
  return [...items].sort((a, b) => {
    const cmp = dateOf(a).localeCompare(dateOf(b))
    return direction === 'asc' ? cmp : -cmp
  })
}
