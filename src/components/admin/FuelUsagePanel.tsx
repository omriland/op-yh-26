import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Search, ShieldAlert } from 'lucide-react'
import { PeriodPicker } from './PeriodPicker'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../ui/Skeleton'
import { formatNumber, monoClass } from '../../lib/format'
import { isValidFuelRefundRange, loadFuelRefundReport } from '../../lib/fuelRefundReport'
import { formatLiters, toUsageRows, usageTotals, type FuelUsageRow } from '../../lib/fuelUsage'
import { defaultPeriod, periodToRange, type PeriodValue } from '../../lib/periodRange'
import { downloadCsv, toCsv } from '../../lib/reports/csv'
import { fieldsMatchQuery } from '../../lib/searchQuery'
import { useIsDesktop } from '../../lib/useMediaQuery'

export function FuelUsagePanel() {
  const isDesktop = useIsDesktop()
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod())
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<FuelUsageRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const range = periodToRange(period)
  const rangeValid = isValidFuelRefundRange(range.from, range.to)

  useEffect(() => {
    if (!rangeValid) {
      setRows(null)
      setFailed(false)
      return
    }

    let active = true
    setRows(null)
    setFailed(false)

    void loadFuelRefundReport(range.from, range.to)
      .then((next) => {
        if (active) setRows(toUsageRows(next))
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [range.from, range.to, rangeValid, reloadKey])

  const filtered = useMemo(() => filterUsageRows(rows ?? [], query), [rows, query])
  const totals = useMemo(() => usageTotals(filtered), [filtered])
  const loading = rangeValid && !failed && rows === null

  function exportCsv() {
    if (filtered.length === 0) return
    downloadCsv(
      'שימוש-דלק.csv',
      toCsv(
        ['מתנדב', 'קילומטרים', 'אירועים', 'ליטרים'],
        filtered.map((row) => [
          [row.full_name, row.callsign].filter(Boolean).join(' · '),
          formatNumber(row.total_km),
          formatNumber(row.event_count),
          formatLiters(row.total_km),
        ]),
      ),
    )
  }

  return (
    <div className="stack-4">
      <div className="page-head">
        <div>
          <h1 className="t-title">שימוש בדלק</h1>
          <p className="t-caption text-muted">
            קילומטרים, אירועים וליטרים לפי תאריך דיווח האירוע.
            <br />
            מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.
          </p>
        </div>
        <div className="page-head__actions">
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            icon={<Download size={20} strokeWidth={1.75} />}
          >
            ייצוא CSV
          </Button>
        </div>
      </div>

      <div className="report-filters">
        <PeriodPicker value={period} onChange={setPeriod} />
        <label className="search-field">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">חיפוש בדוח</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש בדוח"
          />
        </label>
      </div>

      {!rangeValid ? <p className="t-caption text-danger">טווח תאריכים לא תקין</p> : null}

      {failed ? (
        <EmptyState
          icon={<ShieldAlert size={40} strokeWidth={1.75} />}
          title="טעינת השימוש בדלק נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {loading ? (isDesktop ? <EventRowsSkeleton /> : <EventListSkeleton />) : null}

      {!loading && !failed && rangeValid && rows && filtered.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} />}
          title="אין נתונים להצגה"
        />
      ) : null}

      {!loading && !failed && filtered.length > 0 ? (
        <div className="stack-4">
          <p className="t-caption text-muted">
            סה״כ <span className="mono">{formatNumber(totals.totalKm)}</span> ק״מ ·{' '}
            <span className="mono">{formatLiters(totals.totalKm)}</span> ל׳ ·{' '}
            <span className="mono">{formatNumber(totals.withKm)}</span> מתנדבים עם ק״מ
          </p>

          {isDesktop ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">מתנדב</th>
                    <th scope="col">קילומטרים</th>
                    <th scope="col">אירועים</th>
                    <th scope="col">ליטרים</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div>{row.full_name}</div>
                        <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                          {row.callsign}
                        </div>
                      </td>
                      <td className="num mono">{formatNumber(row.total_km)}</td>
                      <td className="num mono">{formatNumber(row.event_count)}</td>
                      <td className="num mono">{formatLiters(row.total_km)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="stack-3">
              {filtered.map((row) => (
                <li key={row.id} className="card stack-2">
                  <span className="t-body">{row.full_name}</span>
                  <span className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                    {row.callsign}
                  </span>
                  <span className="t-caption text-muted">
                    קילומטרים:{' '}
                    <span className="mono">{formatNumber(row.total_km)}</span>
                  </span>
                  <span className="t-caption text-muted">
                    אירועים: <span className="mono">{formatNumber(row.event_count)}</span>
                  </span>
                  <span className="t-caption text-muted">
                    ליטרים: <span className="mono">{formatLiters(row.total_km)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function filterUsageRows(rows: FuelUsageRow[], query: string): FuelUsageRow[] {
  const needle = query.trim()
  if (!needle) return rows
  return rows.filter((row) =>
    fieldsMatchQuery(
      [
        row.full_name,
        row.callsign,
        formatNumber(row.total_km),
        formatNumber(row.event_count),
        formatLiters(row.total_km),
      ],
      needle,
    ),
  )
}
