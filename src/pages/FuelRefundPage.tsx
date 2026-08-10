import { useEffect, useState } from 'react'
import { Calendar, Fuel, ShieldAlert } from 'lucide-react'
import {
  defaultFuelRefundRange,
  isValidFuelRefundRange,
  loadFuelRefundReport,
  type FuelRefundRow,
} from '../lib/fuelRefundReport'
import { formatNumber, monoClass } from '../lib/format'
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
  const [rows, setRows] = useState<FuelRefundRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const rangeValid = isValidFuelRefundRange(from, to)
  const rangeError = from && to && !rangeValid ? 'טווח תאריכים לא תקין' : undefined

  useEffect(() => {
    if (!rangeValid) {
      setRows(null)
      setFailed(false)
      return
    }

    let active = true
    setRows(null)
    setFailed(false)

    void loadFuelRefundReport(from, to)
      .then((next) => {
        if (active) setRows(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [from, to, rangeValid, reloadKey])

  return (
    <div>
      <div className="page-head" style={{ marginBlockEnd: 'var(--space-6)' }}>
        <div>
          <h1 className="t-title">החזר דלק</h1>
          <p className="t-caption text-muted">
            סיכום קילומטרים לפי כונן לפי תאריך דיווח האירוע
          </p>
        </div>
      </div>

      <div
        className="admin-toolbar"
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 16rem))' : '1fr',
          gap: 'var(--space-3)',
          marginBlockEnd: 'var(--space-6)',
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

      {rangeValid && rows === null && !failed ? (
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

      {rows && rows.length === 0 ? (
        <EmptyState
          icon={<Fuel size={40} strokeWidth={1.75} />}
          title="אין משתמשים פעילים."
        />
      ) : null}

      {rows && rows.length > 0 && isDesktop ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">כונן</th>
                <th scope="col">קילומטרים</th>
                <th scope="col">אירועים</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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

      {rows && rows.length > 0 && !isDesktop ? (
        <div className="stack-4">
          {rows.map((row) => (
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
    </div>
  )
}
