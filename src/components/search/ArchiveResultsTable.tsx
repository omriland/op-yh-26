import { Fragment, type KeyboardEvent } from 'react'
import { formatDate, monoClass } from '../../lib/format'
import type { ArchiveRow } from '../../lib/smartSearchApi'
import { HoverTip } from '../ui/HoverTip'

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

/** Old-site archive rows. No stamps — the archive has no status. Mobile gets cards, never a table. */
export function ArchiveResultsTable({
  rows,
  asTable,
  onOpen,
}: {
  rows: ArchiveRow[]
  asTable: boolean
  onOpen: (eventFk: string) => void
}) {
  if (!asTable) {
    return (
      <ul className="stack-3">
        {rows.map((row) => (
          <li key={row.event_fk} className="card search-archive-card">
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
        ))}
      </ul>
    )
  }

  const onKey = (row: ArchiveRow) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    onOpen(row.event_fk)
  }

  return (
    <div className="table-wrap">
      <table className="table search-archive-table">
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">מספר אירוע</th>
            <th scope="col">כביש / מיקום</th>
            <th scope="col">כוננים</th>
            <th scope="col">רכבים</th>
            <th scope="col">נזק</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.event_fk}>
              <tr
                tabIndex={0}
                role="button"
                aria-label={openLabel(row)}
                onClick={() => onOpen(row.event_fk)}
                onKeyDown={onKey(row)}
              >
                <td className="num mono table-cell--nowrap">{dateLabel(row)}</td>
                <td className={`num ${monoClass(row.event_number)}`}>{row.event_number || '—'}</td>
                <td>
                  <Truncated text={place(row)} />
                </td>
                <td>
                  <Truncated text={row.people} />
                </td>
                <td>
                  <Truncated text={row.cars} />
                </td>
                <td>
                  <Truncated text={row.damage} />
                </td>
              </tr>
              {row.found_by ? (
                <tr className="table-row--found-by" onClick={() => onOpen(row.event_fk)}>
                  <td colSpan={6}>
                    <p className="t-caption search-archive-table__found-by">
                      <span className="text-secondary">נמצא לפי:</span> {row.found_by}
                    </p>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
