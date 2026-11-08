import { formatDate, monoClass } from '../../lib/format'
import type { ArchiveRow } from '../../lib/smartSearchApi'
import { HoverTip } from '../ui/HoverTip'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { isoSortValue } from '../../lib/tableSort'

function place(row: ArchiveRow): string {
  return [row.road, row.location].filter(Boolean).join(' · ')
}

function dateLabel(row: ArchiveRow): string {
  return row.event_date ? formatDate(row.event_date) : '—'
}

function openLabel(row: ArchiveRow): string {
  return row.event_number ? `פתיחת דוח אירוע ${row.event_number}` : 'פתיחת דוח אירוע'
}

function Truncated({ text }: { text: string }) {
  return (
    <HoverTip text={text} className="table-col--truncate__text">
      {text || '—'}
    </HoverTip>
  )
}

function archiveCard(row: ArchiveRow, onOpen: (eventFk: string) => void) {
  return (
    <li className="card search-archive-card">
      <button type="button" className="search-archive-card__open" onClick={() => onOpen(row.event_fk)}>
        <span className="t-section">{place(row) || '—'}</span>
        {row.cars || row.damage ? (
          <span className="t-body text-secondary">{[row.cars, row.damage].filter(Boolean).join(' · ')}</span>
        ) : null}
        <span className="t-caption text-muted">
          <span className="mono">{dateLabel(row)}</span>
          {row.event_number ? (
            <>
              {' · אירוע '}
              <span className={monoClass(row.event_number)}>{row.event_number}</span>
            </>
          ) : null}
          {row.people ? ` · ${row.people}` : null}
        </span>
        <span className="t-caption text-muted">נמצא לפי: {row.found_by}</span>
      </button>
    </li>
  )
}

const ARCHIVE_COLUMNS: DataTableColumn<ArchiveRow>[] = [
  {
    id: 'date',
    header: 'תאריך',
    className: 'num mono table-cell--nowrap',
    sortValue: (row) => isoSortValue(row.event_date),
    cell: dateLabel,
  },
  {
    id: 'number',
    header: 'מספר אירוע',
    className: (row) => `num ${monoClass(row.event_number)}`,
    sortValue: (row) => row.event_number,
    cell: (row) => row.event_number || '—',
  },
  { id: 'place', header: 'כביש / מיקום', sortValue: place, cell: (row) => <Truncated text={place(row)} /> },
  { id: 'people', header: 'כוננים', sortValue: (row) => row.people, cell: (row) => <Truncated text={row.people} /> },
  { id: 'cars', header: 'רכבים', sortValue: (row) => row.cars, cell: (row) => <Truncated text={row.cars} /> },
  { id: 'damage', header: 'נזק', sortValue: (row) => row.damage, cell: (row) => <Truncated text={row.damage} /> },
]

/** Old-site archive rows. No stamps — the archive has no status. Mobile gets cards, never a table. */
export function ArchiveResultsTable({
  rows,
  asTable,
  onOpen,
  partialSortNote,
}: {
  rows: ArchiveRow[]
  asTable: boolean
  onOpen: (eventFk: string) => void
  partialSortNote?: string
}) {
  return (
    <DataTable
      rows={rows}
      columns={ARCHIVE_COLUMNS}
      rowKey={(row) => row.event_fk}
      asTable={asTable}
      renderCard={(row) => archiveCard(row, onOpen)}
      defaultSort={{ columnId: 'date', direction: 'desc' }}
      partialSortNote={partialSortNote}
      className="search-archive-table"
      onRowClick={(row) => onOpen(row.event_fk)}
      rowLabel={openLabel}
      renderSubRows={(row, colSpan) =>
        row.found_by ? (
          <tr className="table-row--found-by" onClick={() => onOpen(row.event_fk)}>
            <td colSpan={colSpan}>
              <p className="t-caption search-archive-table__found-by">
                <span className="text-secondary">נמצא לפי:</span> {row.found_by}
              </p>
            </td>
          </tr>
        ) : null
      }
    />
  )
}
