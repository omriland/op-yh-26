import { useEffect, useState } from 'react'
import { Calendar, ShieldAlert, Table2 } from 'lucide-react'
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
import { TextField } from '../components/ui/TextField'

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
        <TextField
          label="מתאריך"
          type="date"
          required
          value={from}
          error={rangeError}
          onChange={(event) => setFrom(event.target.value)}
          affix={
            <span className="field__affix" aria-hidden="true">
              <Calendar size={20} strokeWidth={1.75} />
            </span>
          }
        />
        <TextField
          label="עד תאריך"
          type="date"
          required
          value={to}
          onChange={(event) => setTo(event.target.value)}
          affix={
            <span className="field__affix" aria-hidden="true">
              <Calendar size={20} strokeWidth={1.75} />
            </span>
          }
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

      {segment === 'summary' && summaryRows && summaryRows.length > 0 && isDesktop ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">מתנדב</th>
                <th scope="col">קילומטרים</th>
                <th scope="col">אירועים</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.full_name}</div>
                    <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                      {row.callsign}
                    </div>
                  </td>
                  <td className="num mono">{formatNumber(row.total_km)}</td>
                  <td className="num mono">{formatNumber(row.event_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {segment === 'summary' && summaryRows && summaryRows.length > 0 && !isDesktop ? (
        <div className="stack-4">
          {summaryRows.map((row) => (
            <article key={row.id} className="card">
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
          ))}
        </div>
      ) : null}

      {segment === 'detail' && detailRows && detailRows.length > 0 && isDesktop ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">מתנדב</th>
                <th scope="col">תאריך</th>
                <th scope="col">שעה</th>
                <th scope="col">מיקום</th>
                <th scope="col">סוג אירוע</th>
                <th scope="col">סה״כ ק״מ</th>
                <th scope="col">הערות</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.full_name}</div>
                    <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                      {row.callsign}
                    </div>
                  </td>
                  <td className="num mono">{formatDate(row.created_at)}</td>
                  <td className="num mono">{formatTime(row.started_at) ?? '—'}</td>
                  <td>{row.location || '—'}</td>
                  <td>{row.event_type_name || '—'}</td>
                  <td className="num mono">{formatNumber(row.total_km)}</td>
                  <td>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {segment === 'detail' && detailRows && detailRows.length > 0 && !isDesktop ? (
        <div className="stack-4">
          {detailRows.map((row) => (
            <article key={row.id} className="card">
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
          ))}
        </div>
      ) : null}
    </div>
  )
}
