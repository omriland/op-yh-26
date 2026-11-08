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
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { isoSortValue } from '../lib/tableSort'

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
                    key={kmRowKey(row)}
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

function kmRowKey(row: KmExceptionRow): string {
  return `${row.event_id}:${row.responder_callsign}:${row.total_km}`
}

function kmResponder(row: KmExceptionRow): string {
  return [row.responder_name, row.responder_callsign].filter(Boolean).join(' · ')
}

function kmPlace(row: KmExceptionRow): string {
  return [row.road_name, row.location].filter(Boolean).join(' · ')
}

const KM_COLUMNS: DataTableColumn<KmExceptionRow>[] = [
  {
    id: 'date',
    header: 'תאריך',
    className: 'num mono',
    sortValue: (row) => isoSortValue(row.event_date),
    cell: (row) => formatDate(row.event_date),
  },
  { id: 'responder', header: 'מתנדב', sortValue: kmResponder, cell: (row) => kmResponder(row) || '—' },
  {
    id: 'km',
    header: 'ק״מ',
    className: 'num mono',
    sortValue: (row) => row.total_km,
    cell: (row) => formatNumber(row.total_km),
  },
  {
    id: 'type',
    header: 'סוג אירוע',
    sortValue: (row) => row.event_type_name,
    cell: (row) => (
      <EventTypeLabel
        event={{
          event_type: row.event_type_name ? { name: row.event_type_name } : null,
          is_cancelled: row.is_cancelled,
        }}
      />
    ),
  },
  {
    id: 'place',
    header: 'כביש / מיקום',
    className: 'truncate',
    sortValue: kmPlace,
    cell: (row) => kmPlace(row) || '—',
  },
  {
    id: 'lead',
    header: 'אחמ״ש',
    sortValue: (row) => row.shift_lead_name,
    cell: (row) => row.shift_lead_name ?? '—',
  },
  {
    id: 'police',
    header: 'מספר אירוע',
    className: (row) => `num ${monoClass(row.police_event_id)}`,
    sortValue: (row) => row.police_event_id,
    cell: (row) => row.police_event_id ?? '—',
  },
]

function KmExceptionsTable({
  rows,
  onOpen,
}: {
  rows: KmExceptionRow[]
  onOpen: (eventId: string) => void
}) {
  return (
    <DataTable
      rows={rows}
      columns={KM_COLUMNS}
      rowKey={kmRowKey}
      defaultSort={{ columnId: 'date', direction: 'desc' }}
      onRowClick={(row) => onOpen(row.event_id)}
      rowLabel={(row) => `פתיחת אירוע ${row.police_event_id ?? formatDate(row.event_date)}`}
    />
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
