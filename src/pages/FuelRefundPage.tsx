import { useEffect, useState } from 'react'
import { ShieldAlert, Table2 } from 'lucide-react'
import {
  FuelRefundSegmentBar,
  type FuelRefundSegment,
} from '../components/admin/FuelRefundSegmentBar'
import {
  defaultFuelRefundRange,
  isValidFuelRefundRange,
  loadFuelRefundReport,
  type FuelRefundRow,
} from '../lib/fuelRefundReport'
import {
  loadFuelDetailReport,
  type FuelDetailRow,
} from '../lib/fuelDetailReport'
import { formatDate, formatNumber, formatTime, monoClass } from '../lib/format'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { DateField } from '../components/ui/DateField'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { displayTextSortValue, isoSortValue } from '../lib/tableSort'

export function FuelRefundPage() {
  const isDesktop = useIsDesktop()
  const defaults = defaultFuelRefundRange()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [segment, setSegment] = useState<FuelRefundSegment>('summary')
  const [summaryRows, setSummaryRows] = useState<FuelRefundRow[] | null>(null)
  const [detailRows, setDetailRows] = useState<FuelDetailRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const rangeValid = isValidFuelRefundRange(from, to)
  const rangeError = from && to && !rangeValid ? 'טווח תאריכים לא תקין' : undefined

  useEffect(() => {
    if (!rangeValid) {
      setSummaryRows(null)
      setDetailRows(null)
      setFailed(false)
      return
    }

    let active = true
    setFailed(false)

    if (segment === 'summary') {
      setSummaryRows(null)
      void loadFuelRefundReport(from, to)
        .then((next) => {
          if (active) setSummaryRows(next)
        })
        .catch(() => {
          if (active) setFailed(true)
        })
    } else {
      setDetailRows(null)
      void loadFuelDetailReport(from, to)
        .then((next) => {
          if (active) setDetailRows(next)
        })
        .catch(() => {
          if (active) setFailed(true)
        })
    }

    return () => {
      active = false
    }
  }, [from, to, rangeValid, reloadKey, segment])

  const loading =
    rangeValid &&
    !failed &&
    ((segment === 'summary' && summaryRows === null) ||
      (segment === 'detail' && detailRows === null))

  return (
    <div>
      <div className="page-head" style={{ marginBlockEnd: 'var(--space-6)' }}>
        <div>
          <h1 className="t-title">טבלה מסכמת</h1>
          <p className="t-caption text-muted">
            {segment === 'summary'
              ? 'סיכום קילומטרים לפי מתנדב לפי תאריך דיווח האירוע'
              : 'פירוט אירועים לפי תאריך דיווח — שורה לכל השתתפות עם ק״מ'}
          </p>
        </div>
      </div>

      <div
        className="admin-toolbar"
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 16rem))' : '1fr',
          gap: 'var(--space-3)',
          marginBlockEnd: 'var(--space-4)',
        }}
      >
        <DateField
          label="מתאריך"
          required
          value={from}
          error={rangeError}
          onChange={setFrom}
        />
        <DateField
          label="עד תאריך"
          required
          value={to}
          onChange={setTo}
        />
      </div>

      <div style={{ marginBlockEnd: 'var(--space-6)' }}>
        <FuelRefundSegmentBar segment={segment} onChange={setSegment} />
      </div>

      {loading ? (
        isDesktop ? (
          <EventRowsSkeleton rows={6} />
        ) : (
          <EventListSkeleton count={4} />
        )
      ) : null}

      {failed ? (
        <EmptyState
          icon={<ShieldAlert size={40} strokeWidth={1.75} />}
          title="לא הצלחנו לטעון את הדוח."
          caption="בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((v) => v + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {segment === 'summary' && summaryRows && summaryRows.length === 0 ? (
        <EmptyState
          icon={<Table2 size={40} strokeWidth={1.75} />}
          title="אין משתמשים פעילים."
        />
      ) : null}

      {segment === 'detail' && detailRows && detailRows.length === 0 ? (
        <EmptyState
          icon={<Table2 size={40} strokeWidth={1.75} />}
          title="אין פירוט דלק בטווח שנבחר."
        />
      ) : null}

      {segment === 'summary' && summaryRows && summaryRows.length > 0 ? (
        <DataTable
          rows={summaryRows}
          columns={SUMMARY_COLUMNS}
          rowKey={(row) => row.id}
          asTable={isDesktop}
          cards={{ as: 'div', className: 'stack-4' }}
          defaultSort={{ columnId: 'name', direction: 'asc' }}
          renderCard={(row) => (
            <article className="card">
              <div className="row-between">
                <div>
                  <div className="t-body">{row.full_name}</div>
                  <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                    {row.callsign}
                  </div>
                </div>
                <div className="num mono t-body">{formatNumber(row.total_km)} ק״מ</div>
              </div>
              <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
                אירועים: <span className="num mono">{formatNumber(row.event_count)}</span>
              </p>
            </article>
          )}
        />
      ) : null}

      {segment === 'detail' && detailRows && detailRows.length > 0 ? (
        <DataTable
          rows={detailRows}
          columns={DETAIL_COLUMNS}
          rowKey={(row) => row.id}
          asTable={isDesktop}
          cards={{ as: 'div', className: 'stack-4' }}
          defaultSort={{ columnId: 'date', direction: 'desc' }}
          renderCard={(row) => (
            <article className="card">
              <div className="row-between">
                <div>
                  <div className="t-body">{row.full_name}</div>
                  <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                    {row.callsign}
                  </div>
                </div>
                <div className="num mono t-body">{formatNumber(row.total_km)} ק״מ</div>
              </div>
              <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
                <span className="mono">{formatDate(row.created_at)}</span>
                {formatTime(row.started_at) ? (
                  <>
                    {' · '}
                    <span className="mono">{formatTime(row.started_at)}</span>
                  </>
                ) : null}
              </p>
              {row.location ? (
                <p className="t-caption" style={{ marginBlockStart: 'var(--space-1)' }}>
                  {row.location}
                </p>
              ) : null}
              {row.event_type_name ? (
                <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-1)' }}>
                  {row.event_type_name}
                </p>
              ) : null}
              {row.notes ? (
                <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-1)' }}>
                  {row.notes}
                </p>
              ) : null}
            </article>
          )}
        />
      ) : null}
    </div>
  )
}

function ResponderCell({ name, callsign }: { name: string; callsign: string | null }) {
  return (
    <>
      <div>{name}</div>
      <div className={`t-caption text-muted ${monoClass(callsign)}`}>{callsign}</div>
    </>
  )
}

const SUMMARY_COLUMNS: DataTableColumn<FuelRefundRow>[] = [
  {
    id: 'name',
    header: 'מתנדב',
    sortValue: (row) => row.full_name,
    cell: (row) => <ResponderCell name={row.full_name} callsign={row.callsign} />,
  },
  {
    id: 'km',
    header: 'קילומטרים',
    className: 'num mono',
    sortValue: (row) => row.total_km,
    cell: (row) => formatNumber(row.total_km),
  },
  {
    id: 'events',
    header: 'אירועים',
    className: 'num mono',
    sortValue: (row) => row.event_count,
    cell: (row) => formatNumber(row.event_count),
  },
]

const DETAIL_COLUMNS: DataTableColumn<FuelDetailRow>[] = [
  {
    id: 'name',
    header: 'מתנדב',
    sortValue: (row) => row.full_name,
    cell: (row) => <ResponderCell name={row.full_name} callsign={row.callsign} />,
  },
  {
    id: 'date',
    header: 'תאריך',
    className: 'num mono',
    sortValue: (row) => isoSortValue(row.created_at),
    cell: (row) => formatDate(row.created_at),
  },
  {
    id: 'time',
    header: 'שעה',
    className: 'num mono',
    sortValue: (row) => displayTextSortValue(formatTime(row.started_at)),
    cell: (row) => formatTime(row.started_at) ?? '—',
  },
  { id: 'location', header: 'מיקום', sortValue: (row) => row.location, cell: (row) => row.location || '—' },
  {
    id: 'type',
    header: 'סוג אירוע',
    sortValue: (row) => row.event_type_name,
    cell: (row) => row.event_type_name || '—',
  },
  {
    id: 'km',
    header: 'סה״כ ק״מ',
    className: 'num mono',
    sortValue: (row) => row.total_km,
    cell: (row) => formatNumber(row.total_km),
  },
  { id: 'notes', header: 'הערות', sortValue: (row) => row.notes, cell: (row) => row.notes || '—' },
]
