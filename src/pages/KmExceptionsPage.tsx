import { useEffect, useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import {
  fetchKmExceptionRows,
  type KmExceptionRow,
} from '../lib/kmExceptionsReport'
import { formatDate, formatDayHeading, formatNumber, monoClass } from '../lib/format'
import { Button } from '../components/ui/Button'
import { DateGroup, DateGroups } from '../components/ui/DateGroups'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { EventTypeLabel } from '../components/events/EventTypeLabel'

type KmExceptionsPageProps = {
  asTable: boolean
  onOpen: (eventId: string) => void
}

export function KmExceptionsPage({ asTable, onOpen }: KmExceptionsPageProps) {
  const [rows, setRows] = useState<KmExceptionRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setRows(null)
    setFailed(false)

    fetchKmExceptionRows()
      .then((next) => {
        if (active) setRows(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const grouped = useMemo(() => (rows ? groupByDate(rows) : []), [rows])

  return (
    <div>
      {failed ? (
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : !rows ? (
        asTable ? <EventRowsSkeleton /> : <EventListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין חריגי ק״מ להצגה"
        />
      ) : asTable ? (
        <KmExceptionsTable rows={rows} onOpen={onOpen} />
      ) : (
        <DateGroups>
          {grouped.map(([day, items]) => (
            <DateGroup key={day} heading={formatDayHeading(day)}>
              <ul className="stack-3">
                {items.map((row) => (
                  <KmExceptionCard
                    key={`${row.event_id}:${row.responder_callsign}:${row.total_km}`}
                    row={row}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </DateGroup>
          ))}
        </DateGroups>
      )}
    </div>
  )
}

function KmExceptionCard({
  row,
  onOpen,
}: {
  row: KmExceptionRow
  onOpen: (eventId: string) => void
}) {
  const place = [row.road_name, row.location].filter(Boolean).join(' · ')
  const responder = [row.responder_name, row.responder_callsign].filter(Boolean).join(' · ')

  return (
    <li className="card">
      <button type="button" className="event-card" onClick={() => onOpen(row.event_id)}>
        <span className="event-card__top">
          <EventTypeLabel
            event={{
              event_type: row.event_type_name ? { name: row.event_type_name } : null,
              is_cancelled: row.is_cancelled,
            }}
            as="section"
            fallback="אירוע"
          />
          <span className="mono t-section">
            {formatNumber(row.total_km)} ק״מ
          </span>
        </span>
        <span className="t-body">{responder || '—'}</span>
        <span className="t-body text-secondary">{place || '—'}</span>
        <span className="event-card__meta">
          <span className="mono">{formatDate(row.event_date)}</span>
          {row.shift_lead_name ? <span>· {row.shift_lead_name}</span> : null}
          {row.police_event_id ? (
            <span>
              · אירוע{' '}
              <span className={monoClass(row.police_event_id)}>{row.police_event_id}</span>
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

function KmExceptionsTable({
  rows,
  onOpen,
}: {
  rows: KmExceptionRow[]
  onOpen: (eventId: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">מתנדב</th>
            <th scope="col">ק״מ</th>
            <th scope="col">סוג אירוע</th>
            <th scope="col">כביש / מיקום</th>
            <th scope="col">אחמ״ש</th>
            <th scope="col">מספר אירוע</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.event_id}:${row.responder_callsign}:${row.total_km}`}
              onClick={() => onOpen(row.event_id)}
            >
              <td className="num mono">{formatDate(row.event_date)}</td>
              <td>
                {[row.responder_name, row.responder_callsign].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="num mono">{formatNumber(row.total_km)}</td>
              <td>
                <EventTypeLabel
                  event={{
                    event_type: row.event_type_name ? { name: row.event_type_name } : null,
                    is_cancelled: row.is_cancelled,
                  }}
                />
              </td>
              <td className="truncate">
                {[row.road_name, row.location].filter(Boolean).join(' · ') || '—'}
              </td>
              <td>{row.shift_lead_name ?? '—'}</td>
              <td className={`num ${monoClass(row.police_event_id)}`}>
                {row.police_event_id ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function groupByDate(rows: KmExceptionRow[]): [string, KmExceptionRow[]][] {
  const groups = new Map<string, KmExceptionRow[]>()
  for (const row of rows) {
    const bucket = groups.get(row.event_date) ?? []
    bucket.push(row)
    groups.set(row.event_date, bucket)
  }
  return [...groups.entries()]
}
