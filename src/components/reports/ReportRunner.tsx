import { useEffect, useMemo, useState, type HTMLAttributes } from 'react'
import { ChevronRight, Download, Search, BarChart3 } from 'lucide-react'
import { PeriodPicker } from '../admin/PeriodPicker'
import { Button } from '../ui/Button'
import { AlertDialog } from '../ui/AlertDialog'
import { EmptyState } from '../ui/EmptyState'
import { HoverTip } from '../ui/HoverTip'
import { EventListSkeleton, EventRowsSkeleton } from '../ui/Skeleton'
import { DateField } from '../ui/DateField'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { downloadCsv, toCsv } from '../../lib/reports/csv'
import { filterReportRows } from '../../lib/reports/search'
import type { SortDirection, SummaryGroup } from '../../lib/reports/summaryReport'
import type {
  ReportColumn,
  ReportDateRange,
  ReportKind,
  ReportRowCommand,
  ReportTableRow,
  ReportViewer,
} from '../../lib/reports/types'
import { EventFrozenMark } from '../events/EventFrozenMark'
import { useEventHoverPreview } from './useEventHoverPreview'
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
  const hoverPreview = useEventHoverPreview({
    enabled: Boolean(kind.previewEventOnHover && isAdmin && asTable && onOpenEvent),
    viewer,
    onOpenEvent: (eventId) => onOpenEvent?.(eventId),
  })
  const defaults = defaultFuelRefundRange()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod())
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ReportTableRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingRow, setPendingRow] = useState<ReportTableRow | null>(null)
  const [pendingCommand, setPendingCommand] = useState<{
    command: ReportRowCommand
    row: ReportTableRow
  } | null>(null)
  const [applying, setApplying] = useState(false)
  const [group, setGroup] = useState<SummaryGroup>(kind.grouping?.defaultValue ?? 'responder')
  const [sort, setSort] = useState<ReportSort | null>(null)
  const [openGroupRow, setOpenGroupRow] = useState<ReportTableRow | null>(null)
  const [daysText, setDaysText] = useState(String(kind.daysInput?.defaultValue ?? ''))

  const periodRange = periodToRange(period)
  const rangeFrom = kind.hasPeriodPicker ? periodRange.from : from
  const rangeTo = kind.hasPeriodPicker ? periodRange.to : to
  const rangeValid = !kind.hasDateRange || isValidFuelRefundRange(rangeFrom, rangeTo)
  const rangeError = kind.hasDateRange && rangeFrom && rangeTo && !rangeValid ? 'טווח תאריכים לא תקין' : undefined
  const days = Number(daysText)
  const daysValid = !kind.daysInput || (daysText.trim() !== '' && kind.daysInput.isValid(days))
  const daysError = daysValid ? undefined : kind.daysInput?.errorText
  const inputsValid = rangeValid && daysValid
  const summaryRange = { from: rangeFrom, to: rangeTo }
  const columns = kind.grouping ? kind.grouping.columnsFor(group, summaryRange) : kind.columns
  const shownKind = useMemo(() => ({ ...kind, columns }), [kind, columns])

  useEffect(() => {
    if (!inputsValid) {
      setRows(null)
      setFailed(false)
      return
    }

    let active = true
    setRows(null)
    setFailed(false)

    const nextViewer = { userId, isAdmin }
    const dateInputs = kind.hasDateRange ? { from: rangeFrom, to: rangeTo } : {}
    const daysInputs = kind.daysInput ? { days } : {}
    const groupInputs = kind.grouping ? { group } : {}
    void kind
      .load({ ...dateInputs, ...daysInputs, ...groupInputs, viewer: nextViewer })
      .then((next) => {
        if (active) setRows(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [kind, rangeFrom, rangeTo, inputsValid, days, group, reloadKey, userId, isAdmin])

  const filtered = useMemo(() => (rows ? filterReportRows(rows, query) : []), [rows, query])
  const sorted = useMemo(
    () => (kind.grouping && sort ? kind.grouping.sortRows(filtered, sort.columnId, sort.direction) : filtered),
    [kind.grouping, filtered, sort],
  )
  const sections = useMemo(() => groupRows(sorted), [sorted])
  const totalsValues = kind.grouping && filtered.length > 0 ? kind.grouping.totalsValues(filtered, group, summaryRange) : null

  async function confirmReplace() {
    if (!kind.action || !pendingRow) return
    setApplying(true)
    try {
      await kind.action.apply(pendingRow)
      setRows((current) => (current ?? []).filter((row) => row.id !== pendingRow.id))
      hoverPreview.forgetEventDetails()
      show('הקילומטרים עודכנו', 'done')
    } catch {
      show('עדכון הקילומטרים נכשל. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setApplying(false)
      setPendingRow(null)
    }
  }

  async function confirmCommand() {
    if (!pendingCommand) return
    setApplying(true)
    try {
      await pendingCommand.command.apply(pendingCommand.row)
      show(pendingCommand.command.successToast, 'done')
      hoverPreview.forgetEventDetails()
      setReloadKey((key) => key + 1)
    } catch {
      show(pendingCommand.command.failToast, 'alert')
    } finally {
      setApplying(false)
      setPendingCommand(null)
    }
  }

  function exportCsv() {
    if (filtered.length === 0) return
    if (kind.grouping) {
      downloadCsv(kind.csvFilename, kind.grouping.toCsv(sorted, group, summaryRange))
      return
    }
    downloadCsv(
      kind.csvFilename,
      toCsv(
        kind.columns.map((column) => column.header),
        filtered.map((row) => row.values),
      ),
    )
  }

  function changeGroup(next: string) {
    setGroup(next as SummaryGroup)
    setSort(null)
  }

  function toggleSort(columnId: string) {
    setSort((current) => nextSort(current, columnId))
  }

  const loading = inputsValid && !failed && rows === null

  if (openGroupRow && kind.grouping) {
    return (
      <ReportGroupDetail
        kind={kind}
        viewer={viewer}
        asTable={asTable}
        row={openGroupRow}
        group={group}
        range={{ from: rangeFrom, to: rangeTo }}
        onBack={() => setOpenGroupRow(null)}
        onOpenEvent={onOpenEvent}
      />
    )
  }

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
          <div className={kind.grouping ? 'report-filters report-filters--with-group' : 'report-filters'}>
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
            {kind.grouping ? (
              <SelectField
                label="קיבוץ לפי"
                options={kind.grouping.options}
                value={group}
                onChange={(event) => changeGroup(event.target.value)}
              />
            ) : null}
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

      {kind.grouping && (!kind.hasPeriodPicker || !asTable) ? (
        <div className="report-filters">
          {kind.hasPeriodPicker ? null : (
            <SelectField
              label="קיבוץ לפי"
              options={kind.grouping.options}
              value={group}
              onChange={(event) => changeGroup(event.target.value)}
            />
          )}
          {asTable ? null : (
            <SelectField
              label="מיון"
              options={sortOptions(columns)}
              value={sort ? `${sort.columnId}:${sort.direction}` : ''}
              placeholder="ללא מיון"
              onChange={(event) => setSort(parseSort(event.target.value))}
            />
          )}
        </div>
      ) : null}

      {kind.daysInput ? (
        <div className="admin-toolbar">
          <TextField
            label={kind.daysInput.label}
            type="number"
            inputMode="numeric"
            numeric
            min={1}
            max={365}
            value={daysText}
            error={daysError}
            onChange={(event) => setDaysText(event.target.value)}
          />
        </div>
      ) : null}

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
      ) : !inputsValid ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין נתונים להצגה"
        />
      ) : (
        <div className="stack-4">
          {totalsValues ? <ReportTotals columns={columns} values={totalsValues} /> : null}
          {sections.map((section) => (
            <section key={section.key || 'all'} className="stack-3">
              {section.label ? <h2 className="group-head">{section.label}</h2> : null}
              {asTable ? (
                <ReportTable
                  kind={shownKind}
                  viewer={viewer}
                  rows={section.rows}
                  sort={kind.grouping ? sort : undefined}
                  onSort={kind.grouping ? toggleSort : undefined}
                  onOpenRow={kind.grouping ? setOpenGroupRow : undefined}
                  onOpenEvent={onOpenEvent}
                  previewRowProps={hoverPreview.rowProps}
                  onAction={kind.action ? setPendingRow : undefined}
                  onCommand={(command, row) => setPendingCommand({ command, row })}
                />
              ) : (
                <ul className="stack-3">
                  {section.rows.map((row) => (
                    <ReportCard
                      key={row.id}
                      kind={shownKind}
                      viewer={viewer}
                      row={row}
                      onOpenRow={kind.grouping ? setOpenGroupRow : undefined}
                      onOpenEvent={onOpenEvent}
                      onAction={kind.action ? setPendingRow : undefined}
                      onCommand={(command, nextRow) => setPendingCommand({ command, row: nextRow })}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {kind.action ? (
        <AlertDialog
          open={pendingRow != null}
          status="warning"
          title={kind.action.confirmTitle}
          busy={applying}
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
        </AlertDialog>
      ) : null}

      {kind.commands ? (
        <AlertDialog
          open={pendingCommand != null}
          status={pendingCommand?.command.variant === 'destructive' ? 'danger' : 'warning'}
          title={pendingCommand?.command.confirmTitle ?? ''}
          busy={applying}
          onClose={() => {
            if (!applying) setPendingCommand(null)
          }}
          footer={
            <>
              <Button
                variant={pendingCommand?.command.variant === 'destructive' ? 'destructive' : 'primary'}
                loading={applying}
                loadingLabel={pendingCommand?.command.loadingLabel}
                onClick={() => void confirmCommand()}
              >
                {pendingCommand?.command.confirmLabel}
              </Button>
              <Button variant="secondary" disabled={applying} onClick={() => setPendingCommand(null)}>
                ביטול
              </Button>
            </>
          }
        >
          <p className="t-body">
            {pendingCommand ? pendingCommand.command.confirmBody(pendingCommand.row) : null}
          </p>
        </AlertDialog>
      ) : null}
      {hoverPreview.previewCard}
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

function visibleCommands(
  kind: ReportKind,
  row: ReportTableRow,
  viewer: ReportViewer,
): ReportRowCommand[] {
  return (kind.commands ?? []).filter((command) => !command.visible || command.visible(row, viewer))
}

function ReportTitle({
  row,
  value,
  viewer,
}: {
  row: ReportTableRow
  value: string
  viewer: ReportViewer
}) {
  return (
    <span className="event-card__type">
      <EventFrozenMark event={row.freeze} viewer={viewer} />
      <span>{value}</span>
    </span>
  )
}

function ReportCommandButtons({
  commands,
  row,
  onCommand,
}: {
  commands: ReportRowCommand[]
  row: ReportTableRow
  onCommand?: (command: ReportRowCommand, row: ReportTableRow) => void
}) {
  if (commands.length === 0 || !onCommand) return null
  return (
    <div className="report-row-commands">
      {commands.map((command) => (
        <Button
          key={command.id}
          variant={command.variant}
          onClick={(event) => {
            event.stopPropagation()
            onCommand(command, row)
          }}
        >
          {command.label}
        </Button>
      ))}
    </div>
  )
}

function ReportTable({
  kind,
  viewer,
  rows,
  sort,
  onSort,
  onOpenRow,
  onOpenEvent,
  previewRowProps,
  onAction,
  onCommand,
}: {
  kind: ReportKind
  viewer: ReportViewer
  rows: ReportTableRow[]
  sort?: ReportSort | null
  onSort?: (columnId: string) => void
  onOpenRow?: (row: ReportTableRow) => void
  onOpenEvent?: (eventId: string) => void
  previewRowProps?: (rowKey: string, eventId: string | undefined) => HTMLAttributes<HTMLTableRowElement>
  onAction?: (row: ReportTableRow) => void
  onCommand?: (command: ReportRowCommand, row: ReportTableRow) => void
}) {
  const actionColumnId = kind.action?.columnId
  const showCommands = Boolean(kind.commands?.length)

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {kind.columns.map((column) => (
              <th key={column.id} scope="col" aria-sort={ariaSort(sort, column.id)}>
                {onSort ? (
                  <SortHeaderButton column={column} sort={sort} onSort={onSort} />
                ) : (
                  column.header
                )}
              </th>
            ))}
            {showCommands ? <th scope="col">פעולות</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const commands = visibleCommands(kind, row, viewer)
            return (
            <tr
              key={row.id}
              onClick={rowOpener(row, onOpenEvent, onOpenRow)}
              onKeyDown={onOpenRow ? (event) => openRowOnEnter(event, row, onOpenRow) : undefined}
              tabIndex={onOpenRow ? 0 : undefined}
              {...previewRowProps?.(row.id, row.eventId)}
            >
              {kind.columns.map((column, index) => {
                const isActionCell = Boolean(kind.action && actionColumnId === column.id)
                const value = row.values[index] ?? '—'
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
                      value={value}
                      onAction={onAction}
                    />
                  ) : index === 0 ? (
                    <ReportTitle row={row} value={value} viewer={viewer} />
                  ) : (
                    value
                  )}
                </td>
                )
              })}
              {showCommands ? (
                <td onClick={(event) => event.stopPropagation()}>
                  <ReportCommandButtons commands={commands} row={row} onCommand={onCommand} />
                </td>
              ) : null}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ReportCard({
  kind,
  viewer,
  row,
  onOpenRow,
  onOpenEvent,
  onAction,
  onCommand,
}: {
  kind: ReportKind
  viewer: ReportViewer
  row: ReportTableRow
  onOpenRow?: (row: ReportTableRow) => void
  onOpenEvent?: (eventId: string) => void
  onAction?: (row: ReportTableRow) => void
  onCommand?: (command: ReportRowCommand, row: ReportTableRow) => void
}) {
  const actionId = kind.action?.columnId
  const title = row.values[0] ?? '—'
  const commands = visibleCommands(kind, row, viewer)
  const rest = kind.columns.slice(1).map((column, index) => ({
    id: column.id,
    header: column.header,
    value: row.values[index + 1] ?? '—',
    numeric: column.numeric,
    isAction: Boolean(actionId && column.id === actionId),
  }))

  const titleNode = <ReportTitle row={row} value={title} viewer={viewer} />
  const commandBar = (
    <ReportCommandButtons commands={commands} row={row} onCommand={onCommand} />
  )

  if (kind.action && onAction) {
    return (
      <li className="card stack-2">
        <button
          type="button"
          className="event-card"
          onClick={row.eventId && onOpenEvent ? () => onOpenEvent(row.eventId!) : undefined}
        >
          <span className="t-body">{titleNode}</span>
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
        {commandBar}
      </li>
    )
  }

  const body = (
    <>
      <span className="t-body">{titleNode}</span>
      {rest.map((item) => (
        <span key={item.header} className="t-caption text-muted">
          {item.header}:{' '}
          <span className={item.numeric ? 'mono' : undefined}>{item.value}</span>
        </span>
      ))}
    </>
  )

  if (onOpenRow) {
    return (
      <li className="card stack-2">
        <button type="button" className="event-card" onClick={() => onOpenRow(row)}>
          {body}
        </button>
      </li>
    )
  }

  if (row.eventId && onOpenEvent) {
    return (
      <li className="card stack-2">
        <button type="button" className="event-card" onClick={() => onOpenEvent(row.eventId!)}>
          {body}
        </button>
        {commandBar}
      </li>
    )
  }

  return (
    <li className="card stack-2">
      {body}
      {commandBar}
    </li>
  )
}

type ReportSort = { columnId: string; direction: SortDirection }

function nextSort(current: ReportSort | null, columnId: string): ReportSort {
  if (current?.columnId === columnId) {
    return { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { columnId, direction: 'asc' }
}

function parseSort(value: string): ReportSort | null {
  const [columnId, direction] = value.split(':')
  if (!columnId || (direction !== 'asc' && direction !== 'desc')) return null
  return { columnId, direction }
}

function sortOptions(columns: ReportColumn[]): { value: string; label: string }[] {
  return columns.flatMap((column) => [
    { value: `${column.id}:asc`, label: `${column.header} · עולה` },
    { value: `${column.id}:desc`, label: `${column.header} · יורד` },
  ])
}

function ariaSort(sort: ReportSort | null | undefined, columnId: string) {
  if (!sort || sort.columnId !== columnId) return undefined
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}

function rowOpener(
  row: ReportTableRow,
  onOpenEvent?: (eventId: string) => void,
  onOpenRow?: (row: ReportTableRow) => void,
) {
  if (onOpenRow) return () => onOpenRow(row)
  if (row.eventId && onOpenEvent) return () => onOpenEvent(row.eventId!)
  return undefined
}

function openRowOnEnter(
  event: { key: string; preventDefault: () => void },
  row: ReportTableRow,
  onOpenRow: (row: ReportTableRow) => void,
) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  onOpenRow(row)
}

function SortHeaderButton({
  column,
  sort,
  onSort,
}: {
  column: ReportColumn
  sort?: ReportSort | null
  onSort: (columnId: string) => void
}) {
  const mark = sort?.columnId === column.id ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <button
      type="button"
      onClick={() => onSort(column.id)}
      className="report-sort-button"
    >
      {column.header}
      {mark}
    </button>
  )
}

function ReportTotals({ columns, values }: { columns: ReportColumn[]; values: string[] }) {
  return (
    <div className="card" role="group" aria-label="סיכום כולל">
      <p className="t-caption report-totals">
        <strong>{values[0]}:</strong>{' '}
        {columns.slice(1).map((column, index) => {
          const value = values[index + 1]
          if (!value) return null
          return (
            <span key={column.id} className="report-totals__item">
              <bdi className="mono">{value}</bdi> {column.header}
            </span>
          )
        })}
      </p>
    </div>
  )
}

function ReportGroupDetail({
  kind,
  viewer,
  asTable,
  row,
  group,
  range,
  onBack,
  onOpenEvent,
}: {
  kind: ReportKind
  viewer: ReportViewer
  asTable: boolean
  row: ReportTableRow
  group: SummaryGroup
  range: ReportDateRange
  onBack: () => void
  onOpenEvent?: (eventId: string) => void
}) {
  const [events, setEvents] = useState<ReportTableRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const grouping = kind.grouping
  const detailKind = useMemo(
    () => ({
      ...kind,
      columns: grouping?.detailColumns ?? [],
      grouping: undefined,
      action: undefined,
      commands: undefined,
    }),
    [kind, grouping],
  )

  useEffect(() => {
    let active = true
    setEvents(null)
    setFailed(false)
    void grouping
      ?.loadDetail(row, group, range)
      .then((next) => {
        if (active) setEvents(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [grouping, row, group, range.from, range.to])

  return (
    <div className="stack-4">
      <div className="detail__back">
        <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
          {kind.title}
        </Button>
      </div>
      <div className="page-head">
        <h1 className="t-title">{row.values[0]}</h1>
      </div>
      {failed ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב."
        />
      ) : events === null ? (
        asTable ? <EventRowsSkeleton /> : <EventListSkeleton />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין אירועים להצגה"
        />
      ) : asTable ? (
        <ReportTable kind={detailKind} viewer={viewer} rows={events} onOpenEvent={onOpenEvent} />
      ) : (
        <ul className="stack-3">
          {events.map((event) => (
            <ReportCard
              key={event.id}
              kind={detailKind}
              viewer={viewer}
              row={event}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
