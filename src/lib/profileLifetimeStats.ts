const JERUSALEM = 'Asia/Jerusalem'

function jerusalemYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: JERUSALEM }).format(date)
}

function jerusalemHm(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function addUtcDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(year!, month! - 1, day!))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

function jerusalemDateTime(date: Date): string {
  const raw = new Intl.DateTimeFormat('he-IL', {
    timeZone: JERUSALEM,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return raw.replace(/\//g, '.')
}

/** Quiet freshness line for סיכום פעילות. Calendar + clock are Asia/Jerusalem. */
export function formatLifetimeStatsUpdatedAt(
  updatedAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!updatedAt) return null
  const updated = new Date(updatedAt)
  if (Number.isNaN(updated.getTime())) return null

  const today = jerusalemYmd(now)
  const then = jerusalemYmd(updated)
  const time = jerusalemHm(updated)

  if (then === today) return `עודכן היום ב־${time}`
  if (then === addUtcDays(today, -1)) return `עודכן אתמול ב־${time}`
  return `עודכן ב־${jerusalemDateTime(updated)}`
}
