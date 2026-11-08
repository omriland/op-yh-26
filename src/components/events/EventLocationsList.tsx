import { LocationPlacesField } from './LocationPlacesField'
import { formatDate, monoClass } from '../../lib/format'
import {
  eventLocationIsMissing,
  eventLocationPlaceFields,
  locationPinSourceHint,
  type EventLocationRow,
} from '../../lib/eventLocationsQueue'
import { mapSecondaryLeadRows } from '../../lib/eventShiftLeads'
import type { LocationPlaceFields } from '../../lib/systemDistricts'
import { EventListLeadCaption } from './EventListLeadCaption'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { isoSortValue } from '../../lib/tableSort'

function LocationLeadCaption({
  row,
  showOverflow,
}: {
  row: EventLocationRow
  showOverflow: boolean
}) {
  return (
    <EventListLeadCaption
      main={row.shift_lead}
      secondaries={mapSecondaryLeadRows(row.secondary_leads)}
      showOverflow={showOverflow}
    />
  )
}

type EventLocationsListProps = {
  rows: EventLocationRow[]
  asTable: boolean
  drafts: Record<string, LocationPlaceFields>
  onDraftChange: (eventId: string, next: LocationPlaceFields) => void
  onPlaceCommit: (row: EventLocationRow, place: LocationPlaceFields) => void
  onOpen: (eventId: string) => void
  /** Shown after a re-sort while more pages are still on the server. */
  partialSortNote?: string
}

export function EventLocationsList({
  rows,
  asTable,
  drafts,
  onDraftChange,
  onPlaceCommit,
  onOpen,
  partialSortNote,
}: EventLocationsListProps) {
  const columns: DataTableColumn<EventLocationRow>[] = [
    {
      id: 'police',
      header: 'מספר אירוע',
      className: (row) => `num ${monoClass(row.police_event_id)}`,
      sortValue: (row) => row.police_event_id,
      cell: (row) => row.police_event_id ?? '—',
    },
    {
      id: 'date',
      header: 'תאריך',
      className: 'num mono',
      sortValue: (row) => isoSortValue(row.event_date),
      cell: (row) => formatDate(row.event_date),
    },
    {
      id: 'lead',
      header: 'אחמ״ש',
      sortValue: (row) => row.shift_lead?.full_name,
      cell: (row) => <LocationLeadCaption row={row} showOverflow />,
    },
    {
      id: 'place',
      header: 'כביש ומיקום',
      className: 'truncate',
      sortValue: (row) => {
        const label = roadAndLocation(row)
        return label === '—' ? null : label
      },
      cell: roadAndLocation,
    },
    {
      id: 'maps',
      header: 'כתובת במפה',
      className: 'table-cell--maps',
      interactive: true,
      // Rows still missing a map pin sort first.
      sortValue: (row) => (eventLocationIsMissing(row) ? 0 : 1),
      cell: (row) => (
        <MapsField
          row={row}
          draft={drafts[row.id]}
          onDraftChange={onDraftChange}
          onPlaceCommit={onPlaceCommit}
        />
      ),
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      asTable={asTable}
      renderCard={(row) => (
        <EventLocationCard
          row={row}
          draft={drafts[row.id]}
          onDraftChange={onDraftChange}
          onPlaceCommit={onPlaceCommit}
          onOpen={onOpen}
        />
      )}
      defaultSort={{ columnId: 'date', direction: 'desc' }}
      partialSortNote={partialSortNote}
      className="table--event-locations"
      wrapClassName="table-wrap--event-locations"
      onRowClick={(row) => onOpen(row.id)}
      rowLabel={(row) => `פתיחת אירוע ${row.police_event_id ?? formatDate(row.event_date)}`}
      rowClassName={(row) => (eventLocationIsMissing(row) ? 'table-row--missing-map' : undefined)}
    />
  )
}

function EventLocationCard({
  row,
  draft,
  onDraftChange,
  onPlaceCommit,
  onOpen,
}: {
  row: EventLocationRow
  draft?: LocationPlaceFields
  onDraftChange: EventLocationsListProps['onDraftChange']
  onPlaceCommit: EventLocationsListProps['onPlaceCommit']
  onOpen: (eventId: string) => void
}) {
  const missing = eventLocationIsMissing(row)
  return (
    <li
      className={[
        'card',
        'event-locations-card',
        missing ? 'event-locations-card--missing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button type="button" className="event-locations-card__open" onClick={() => onOpen(row.id)}>
        <span className="event-locations-card__top">
          <span className={`t-section ${monoClass(row.police_event_id)}`}>
            {row.police_event_id ?? 'בלי מספר'}
          </span>
          <span className="mono t-caption">{formatDate(row.event_date)}</span>
        </span>
        <span className="t-body">
          <LocationLeadCaption row={row} showOverflow={false} />
        </span>
        <span className="t-body text-secondary">{roadAndLocation(row)}</span>
      </button>
      <div className="event-locations-card__maps">
        <MapsField
          row={row}
          draft={draft}
          onDraftChange={onDraftChange}
          onPlaceCommit={onPlaceCommit}
        />
      </div>
    </li>
  )
}

function MapsField({
  row,
  draft,
  onDraftChange,
  onPlaceCommit,
}: {
  row: EventLocationRow
  draft?: LocationPlaceFields
  onDraftChange: EventLocationsListProps['onDraftChange']
  onPlaceCommit: EventLocationsListProps['onPlaceCommit']
}) {
  const value = draft ?? eventLocationPlaceFields(row)
  const hint = locationPinSourceHint(row.location_pin_source)
  return (
    <div className="event-locations-maps">
      <LocationPlacesField
        value={value}
        hideLabel
        label="כתובת במפה"
        placeholder="חיפוש ב-Google Maps"
        allowFreeText={false}
        roadName={row.road?.name ?? null}
        onChange={(next) => onDraftChange(row.id, next)}
        onPlaceCommit={(place) => onPlaceCommit(row, place)}
      />
      {hint && !eventLocationIsMissing(row) ? (
        <p className="t-caption text-muted event-locations-maps__hint">{hint}</p>
      ) : null}
    </div>
  )
}

/** Event כביש + מיקום text. Never the Google formatted address from a Maps pick. */
function roadAndLocation(row: EventLocationRow): string {
  return [row.road?.name, row.location].filter(Boolean).join(' · ') || '—'
}
