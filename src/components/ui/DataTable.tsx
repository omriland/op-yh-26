import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  ariaSortOf,
  nextSort,
  sortRows,
  type SortValue,
  type TableSort,
} from '../../lib/tableSort'
import { EventListSkeleton, EventRowsSkeleton } from './Skeleton'

export type DataTableColumn<T> = {
  id: string
  header: ReactNode
  /** Plain-text column name, for the sort announcement and when the header is hidden. */
  label?: string
  cell: (row: T) => ReactNode
  /** Omit for columns without data (row actions); every data column should sort. */
  sortValue?: (row: T) => SortValue
  className?: string | ((row: T) => string | undefined)
  headerClassName?: string
  /** The cell holds its own controls, so a click inside it never opens the row. */
  interactive?: boolean
  /** Header shows only to screen readers (an actions column). */
  hideHeader?: boolean
}

type CardList = { as?: 'ul' | 'div'; className?: string }

export type DataTableProps<T> = {
  rows: readonly T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  /** False renders `renderCard` items instead: phones never get a table. */
  asTable?: boolean
  renderCard?: (row: T) => ReactNode
  cards?: CardList
  /** The order `rows` already arrive in, so the header says so. Null: no column is sorted. */
  defaultSort?: TableSort | null
  /** Controlled sort, for two tables that sort together. */
  sort?: TableSort | null
  onSortChange?: (next: TableSort) => void
  onRowClick?: (row: T) => void
  rowClickable?: (row: T) => boolean
  /** Name a keyboard user hears when the row takes focus. */
  rowLabel?: (row: T) => string
  rowClassName?: (row: T) => string | undefined
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>
  /** Extra full-width rows under a row (notices, expanded detail); they move with it. */
  renderSubRows?: (row: T, colSpan: number) => ReactNode
  caption?: ReactNode
  captionClassName?: string
  className?: string
  wrapClassName?: string
  loading?: boolean
  loadingRows?: number
  error?: ReactNode
  empty?: ReactNode
  /** Shown once the viewer re-sorts, when `rows` is not the whole data set. */
  partialSortNote?: string
  /** Editable rows: typing into a sorted column must not move the row being edited. */
  holdOrderOnEdit?: boolean
}

function cellClass<T>(column: DataTableColumn<T>, row: T): string | undefined {
  return typeof column.className === 'function' ? column.className(row) : column.className
}

function columnName<T>(column: DataTableColumn<T>): string {
  if (column.label) return column.label
  return typeof column.header === 'string' ? column.header : column.id
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node
  }
  return null
}

/**
 * Wider than its card: scroll inside the card (header still pinned) instead of clipping.
 * Otherwise the header pins to the page scroller, pulled up over its top padding so no
 * rows show above it.
 */
function useScrollLayout(enabled: boolean) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [stickyTop, setStickyTop] = useState(0)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const table = tableRef.current
    if (!enabled || !wrap || !table) return
    const measure = () => {
      const wide = table.offsetWidth > wrap.clientWidth + 1
      const ownScroller = wide || /(auto|scroll)/.test(getComputedStyle(wrap).overflowY)
      const scroller = ownScroller ? null : scrollParent(wrap)
      setOverflowing(wide)
      setStickyTop(scroller ? -parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    observer.observe(table)
    return () => observer.disconnect()
  }, [enabled])

  return { wrapRef, tableRef, overflowing, stickyTop }
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  asTable = true,
  renderCard,
  cards,
  defaultSort = null,
  sort: controlledSort,
  onSortChange,
  onRowClick,
  rowClickable,
  rowLabel,
  rowClassName,
  rowProps,
  renderSubRows,
  caption,
  captionClassName,
  className,
  wrapClassName,
  loading,
  loadingRows,
  error,
  empty,
  partialSortNote,
  holdOrderOnEdit,
}: DataTableProps<T>) {
  const [ownSort, setOwnSort] = useState<TableSort | null>(defaultSort)
  const sort = controlledSort !== undefined ? controlledSort : ownSort
  const showTable = asTable || !renderCard
  const hasRows = rows.length > 0 && !loading && !error
  const { wrapRef, tableRef, overflowing, stickyTop } = useScrollLayout(showTable && hasRows)

  const heldOrder = useRef<{ sort: TableSort | null; keys: string[] } | null>(null)
  const sorted = useMemo(() => {
    const column = sort ? columns.find((item) => item.id === sort.columnId) : undefined
    if (!sort || !column?.sortValue) return rows
    const held = heldOrder.current
    if (holdOrderOnEdit && held && held.sort === sort && held.keys.length === rows.length) {
      const byKey = new Map(rows.map((row) => [rowKey(row), row]))
      const reused = held.keys.map((key) => byKey.get(key))
      if (reused.every((row) => row !== undefined)) return reused as T[]
    }
    const next = sortRows(rows, column.sortValue, sort.direction)
    heldOrder.current = { sort, keys: next.map(rowKey) }
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowKey is a new function each render
  }, [rows, columns, sort, holdOrderOnEdit])

  if (error) return <>{error}</>
  if (loading) {
    return showTable ? <EventRowsSkeleton rows={loadingRows} /> : <EventListSkeleton count={loadingRows} />
  }
  if (rows.length === 0) return empty ? <>{empty}</> : null

  const resorted =
    sort !== null && (sort.columnId !== defaultSort?.columnId || sort.direction !== defaultSort?.direction)
  const note = partialSortNote && resorted ? (
    <p className="t-caption text-muted data-table__note">{partialSortNote}</p>
  ) : null

  if (!showTable) {
    const List = cards?.as ?? 'ul'
    return (
      <List className={cards?.className ?? 'stack-3'}>
        {sorted.map((row) => (
          <Fragment key={rowKey(row)}>{renderCard!(row)}</Fragment>
        ))}
      </List>
    )
  }

  const onSort = (columnId: string) => {
    const next = nextSort(sort, columnId)
    if (controlledSort === undefined) setOwnSort(next)
    onSortChange?.(next)
  }
  const sortedColumn = sort ? columns.find((item) => item.id === sort.columnId) : undefined

  return (
    <>
      {note}
      <div
        ref={wrapRef}
        className={['table-wrap', 'data-table', wrapClassName].filter(Boolean).join(' ')}
        data-scroll={overflowing ? 'inner' : undefined}
        style={stickyTop ? ({ '--data-table-sticky-top': `${stickyTop}px` } as CSSProperties) : undefined}
      >
        <p className="visually-hidden" aria-live="polite">
          {sort && sortedColumn && resorted
            ? `ממוין לפי ${columnName(sortedColumn)}, ${sort.direction === 'asc' ? 'סדר עולה' : 'סדר יורד'}`
            : ''}
        </p>
        <table ref={tableRef} className={['table', className].filter(Boolean).join(' ')}>
          {caption ? <caption className={captionClassName}>{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  ariaSort={column.sortValue ? ariaSortOf(sort, column.id) : undefined}
                  onSort={column.sortValue ? () => onSort(column.id) : undefined}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = rowKey(row)
              const clickable = Boolean(onRowClick) && (rowClickable?.(row) ?? true)
              const extra = rowProps?.(row) ?? {}
              const open = () => onRowClick?.(row)
              const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                extra.onKeyDown?.(event)
                if (!clickable || event.defaultPrevented) return
                if (event.key !== 'Enter' && event.key !== ' ') return
                if (event.target !== event.currentTarget) return
                event.preventDefault()
                open()
              }
              const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
                extra.onClick?.(event)
                if (!clickable || event.defaultPrevented || event.button !== 0) return
                open()
              }
              const classes = [rowClassName?.(row), clickable ? '' : 'is-static']
                .filter(Boolean)
                .join(' ')
              return (
                <Fragment key={key}>
                  <tr
                    {...extra}
                    className={classes || undefined}
                    tabIndex={clickable ? 0 : extra.tabIndex}
                    aria-label={clickable ? rowLabel?.(row) : extra['aria-label']}
                    onClick={onClick}
                    onKeyDown={onKeyDown}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cellClass(column, row)}
                        onClick={column.interactive ? (event) => event.stopPropagation() : undefined}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                  {renderSubRows?.(row, columns.length)}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function HeaderCell<T>({
  column,
  ariaSort,
  onSort,
}: {
  column: DataTableColumn<T>
  ariaSort?: 'ascending' | 'descending' | 'none'
  onSort?: () => void
}) {
  const name = columnName(column)
  if (column.hideHeader) {
    return (
      <th scope="col" className={column.headerClassName}>
        <span className="visually-hidden">{name}</span>
      </th>
    )
  }
  if (!onSort) {
    return (
      <th scope="col" className={column.headerClassName}>
        {column.header}
      </th>
    )
  }
  const Icon = ariaSort === 'ascending' ? ArrowUp : ariaSort === 'descending' ? ArrowDown : ArrowUpDown
  const active = ariaSort === 'ascending' || ariaSort === 'descending'
  return (
    <th scope="col" className={column.headerClassName} aria-sort={ariaSort}>
      <button
        type="button"
        className={active ? 'table-sort table-sort--active' : 'table-sort'}
        onClick={onSort}
      >
        {column.header}
        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </th>
  )
}
