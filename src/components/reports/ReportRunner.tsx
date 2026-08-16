import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronRight, Download, Search, BarChart3 } from 'lucide-react'
import { PeriodPicker } from '../admin/PeriodPicker'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { EmptyState } from '../ui/EmptyState'
import { HoverTip } from '../ui/HoverTip'
import { EventListSkeleton, EventRowsSkeleton } from '../ui/Skeleton'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { downloadCsv, toCsv } from '../../lib/reports/csv'
import { filterReportRows } from '../../lib/reports/search'
import type { ReportKind, ReportTableRow, ReportViewer } from '../../lib/reports/types'
import {
  defaultFuelRefundRange,
  isValidFuelRefundRange,
} from '../../lib/fuelRefundReport'
import { defaultPeriod, periodToRange, type PeriodValue } from '../../lib/periodRange'

type ReportRunnerProps = {
  kind: ReportKind
  viewer: ReportViewer
  asTable: boolean
  onBack: () => void
  onOpenEvent?: (eventId: string) => void
}

export function ReportRunner({ kind, viewer, asTable, onBack, onOpenEvent }: ReportRunnerProps) {
  const { userId, isAdmin } = viewer
  const { show } = useToast()
  const defaults = defaultFuelRefundRange()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod())
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ReportTableRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingRow, setPendingRow] = useState<ReportTableRow | null>(null)
  const [applying, setApplying] = useState(false)

  const periodRange = periodToRange(period)
  const rangeFrom = kind.hasPeriodPicker ? periodRange.from : from
  const rangeTo = kind.hasPeriodPicker ? periodRange.to : to
  const rangeValid = !kind.hasDateRange || isValidFuelRefundRange(rangeFrom, rangeTo)
  const rangeError = kind.hasDateRange && rangeFrom && rangeTo && !rangeValid ? 'טווח תאריכים לא תקין' : undefined

  useEffect(() => {
    if (!rangeValid) {
      setRows(null)
      setFailed(false)
      return
    }

    let active = true
    setRows(null)
    setFailed(false)

    const nextViewer = { userId, isAdmin }
    void kind
      .load(kind.hasDateRange ? { from: rangeFrom, to: rangeTo, viewer: nextViewer } : { viewer: nextViewer })
      .then((next) => {
        if (active) setRows(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [kind, rangeFrom, rangeTo, rangeValid, reloadKey, userId, isAdmin])

  const filtered = useMemo(() => (rows ? filterReportRows(rows, query) : []), [rows, query])
  const sections = useMemo(() => groupRows(filtered), [filtered])

  async function confirmReplace() {
    if (!kind.action || !pendingRow) return
    setApplying(true)
    try {
      await kind.action.apply(pendingRow)
      setRows((current) => (current ?? []).filter((row) => row.id !== pendingRow.id))
      show('הקילומטרים עודכנו', 'done')
    } catch {
      show('עדכון הקילומטרים נכשל. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setApplying(false)
      setPendingRow(null)
    }
  }

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

      {kind.hasPeriodPicker ? (
        <>
          <div className="report-filters">
            <PeriodPicker value={period} onChange={setPeriod} />
            <label className="search-field">
              <Search size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="visually-hidden">חיפוש בדוח</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={kind.searchPlaceholder ?? 'חיפוש בדוח'}
              />
            </label>
          </div>
          {rangeError ? <p className="t-caption text-danger">{rangeError}</p> : null}
        </>
      ) : (
        <>
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
                placeholder={kind.searchPlaceholder ?? 'חיפוש בדוח'}
              />
            </label>
          </div>
        </>
      )}

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
                  onAction={kind.action ? setPendingRow : undefined}
                />
              ) : (
                <ul className="stack-3">
                  {section.rows.map((row) => (
                    <ReportCard
                      key={row.id}
                      kind={kind}
                      row={row}
                      onOpenEvent={onOpenEvent}
                      onAction={kind.action ? setPendingRow : undefined}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {kind.action ? (
        <Dialog
          open={pendingRow != null}
          title={kind.action.confirmTitle}
          onClose={() => {
            if (!applying) setPendingRow(null)
          }}
          footer={
            <>
              <Button variant="primary" loading={applying} loadingLabel="מחליף…" onClick={() => void confirmReplace()}>
                החלפה
              </Button>
              <Button variant="secondary" disabled={applying} onClick={() => setPendingRow(null)}>
                ביטול
              </Button>
            </>
          }
        >
          <p className="t-body">{pendingRow ? kind.action.confirmBody(pendingRow) : null}</p>
        </Dialog>
      ) : null}
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

function ReportActionValue({
  kind,
  row,
  value,
  onAction,
}: {
  kind: ReportKind
  row: ReportTableRow
  value: string
  onAction?: (row: ReportTableRow) => void
}) {
  if (!kind.action || !onAction) return <>{value}</>
  return (
    <HoverTip text={kind.action.hoverText} mode="always">
      <button
        type="button"
        className="report-km-action"
        onClick={(event) => {
          event.stopPropagation()
          onAction(row)
        }}
      >
        {value}
      </button>
    </HoverTip>
  )
}

function ReportTable({
  kind,
  rows,
  onOpenEvent,
  onAction,
}: {
  kind: ReportKind
  rows: ReportTableRow[]
  onOpenEvent?: (eventId: string) => void
  onAction?: (row: ReportTableRow) => void
}) {
  const actionColumnId = kind.action?.columnId

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
              {kind.columns.map((column, index) => {
                const isActionCell = Boolean(kind.action && actionColumnId === column.id)
                return (
                <td
                  key={column.id}
                  className={column.numeric ? 'num mono' : undefined}
                  onClick={isActionCell ? (event) => event.stopPropagation() : undefined}
                >
                  {isActionCell ? (
                    <ReportActionValue
                      kind={kind}
                      row={row}
                      value={row.values[index] ?? '—'}
                      onAction={onAction}
                    />
                  ) : (
                    row.values[index] ?? '—'
                  )}
                </td>
                )
              })}
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
  onAction,
}: {
  kind: ReportKind
  row: ReportTableRow
  onOpenEvent?: (eventId: string) => void
  onAction?: (row: ReportTableRow) => void
}) {
  const actionId = kind.action?.columnId
  const title = row.values[0] ?? '—'
  const rest = kind.columns.slice(1).map((column, index) => ({
    id: column.id,
    header: column.header,
    value: row.values[index + 1] ?? '—',
    numeric: column.numeric,
    isAction: Boolean(actionId && column.id === actionId),
  }))

  if (kind.action && onAction) {
    return (
      <li className="card stack-2">
        <button
          type="button"
          className="event-card"
          onClick={row.eventId && onOpenEvent ? () => onOpenEvent(row.eventId!) : undefined}
        >
          <span className="t-body">{title}</span>
          {rest
            .filter((item) => !item.isAction)
            .map((item) => (
              <span key={item.header} className="t-caption text-muted">
                {item.header}: <span className={item.numeric ? 'mono' : undefined}>{item.value}</span>
              </span>
            ))}
        </button>
        {rest
          .filter((item) => item.isAction)
          .map((item) => (
            <span key={item.header} className="t-caption">
              {item.header}:{' '}
              <ReportActionValue kind={kind} row={row} value={item.value} onAction={onAction} />
            </span>
          ))}
      </li>
    )
  }

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
