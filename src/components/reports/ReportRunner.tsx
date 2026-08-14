import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronRight, Download, Search, BarChart3 } from 'lucide-react'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../ui/Skeleton'
import { TextField } from '../ui/TextField'
import { downloadCsv, toCsv } from '../../lib/reports/csv'
import { filterReportRows } from '../../lib/reports/search'
import type { ReportKind, ReportTableRow } from '../../lib/reports/types'
import {
  defaultFuelRefundRange,
  isValidFuelRefundRange,
} from '../../lib/fuelRefundReport'

type ReportRunnerProps = {
  kind: ReportKind
  asTable: boolean
  onBack: () => void
  onOpenEvent?: (eventId: string) => void
}

export function ReportRunner({ kind, asTable, onBack, onOpenEvent }: ReportRunnerProps) {
  const defaults = defaultFuelRefundRange()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ReportTableRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const rangeValid = !kind.hasDateRange || isValidFuelRefundRange(from, to)
  const rangeError = kind.hasDateRange && from && to && !rangeValid ? 'טווח תאריכים לא תקין' : undefined

  useEffect(() => {
    if (!rangeValid) {
      setRows(null)
      setFailed(false)
      return
    }

    let active = true
    setRows(null)
    setFailed(false)

    void kind
      .load(kind.hasDateRange ? { from, to } : {})
      .then((next) => {
        if (active) setRows(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [kind, from, to, rangeValid, reloadKey])

  const filtered = useMemo(() => (rows ? filterReportRows(rows, query) : []), [rows, query])
  const sections = useMemo(() => groupRows(filtered), [filtered])

  function exportCsv() {
    if (filtered.length === 0) return
    downloadCsv(
      kind.csvFilename,
      toCsv(
        kind.columns.map((column) => column.header),
        filtered.map((row) => row.values),
      ),
    )
  }

  const loading = rangeValid && !failed && rows === null

  return (
    <div className="stack-4">
      <div className="detail__back">
        <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
          דוחות
        </Button>
      </div>

      <div className="page-head">
        <div>
          <h1 className="t-title">{kind.title}</h1>
          <p className="t-caption text-muted">{kind.includes}</p>
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

      {kind.hasDateRange ? (
        <div
          className="admin-toolbar"
          style={{
            display: 'grid',
            gridTemplateColumns: asTable ? 'repeat(2, minmax(0, 16rem))' : '1fr',
            gap: 'var(--space-3)',
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
      ) : null}

      <div className="admin-toolbar">
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

      {failed ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : loading ? (
        asTable ? <EventRowsSkeleton /> : <EventListSkeleton />
      ) : !rangeValid ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין נתונים להצגה"
        />
      ) : (
        <div className="stack-4">
          {sections.map((section) => (
            <section key={section.key || 'all'} className="stack-3">
              {section.label ? <h2 className="group-head">{section.label}</h2> : null}
              {asTable ? (
                <ReportTable
                  kind={kind}
                  rows={section.rows}
                  onOpenEvent={onOpenEvent}
                />
              ) : (
                <ul className="stack-3">
                  {section.rows.map((row) => (
                    <ReportCard
                      key={row.id}
                      kind={kind}
                      row={row}
                      onOpenEvent={onOpenEvent}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function groupRows(rows: ReportTableRow[]) {
  if (rows.length === 0 || !rows.some((row) => row.groupKey)) {
    return [{ key: '', label: null as string | null, rows }]
  }

  const map = new Map<string, { label: string; rows: ReportTableRow[] }>()
  for (const row of rows) {
    const key = row.groupKey ?? ''
    const existing = map.get(key)
    if (existing) existing.rows.push(row)
    else map.set(key, { label: row.groupLabel ?? key, rows: [row] })
  }
  return [...map.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    rows: group.rows,
  }))
}

function ReportTable({
  kind,
  rows,
  onOpenEvent,
}: {
  kind: ReportKind
  rows: ReportTableRow[]
  onOpenEvent?: (eventId: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {kind.columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={row.eventId && onOpenEvent ? () => onOpenEvent(row.eventId!) : undefined}
            >
              {kind.columns.map((column, index) => (
                <td
                  key={column.id}
                  className={column.numeric ? 'num mono' : undefined}
                >
                  {row.values[index] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportCard({
  kind,
  row,
  onOpenEvent,
}: {
  kind: ReportKind
  row: ReportTableRow
  onOpenEvent?: (eventId: string) => void
}) {
  const title = row.values[0] ?? '—'
  const rest = kind.columns.slice(1).map((column, index) => ({
    header: column.header,
    value: row.values[index + 1] ?? '—',
    numeric: column.numeric,
  }))

  const body = (
    <>
      <span className="t-body">{title}</span>
      {rest.map((item) => (
        <span key={item.header} className="t-caption text-muted">
          {item.header}:{' '}
          <span className={item.numeric ? 'mono' : undefined}>{item.value}</span>
        </span>
      ))}
    </>
  )

  if (row.eventId && onOpenEvent) {
    return (
      <li className="card">
        <button type="button" className="event-card" onClick={() => onOpenEvent(row.eventId!)}>
          {body}
        </button>
      </li>
    )
  }

  return <li className="card stack-2">{body}</li>
}
