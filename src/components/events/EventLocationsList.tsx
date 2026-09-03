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
}

export function EventLocationsList({
  rows,
  asTable,
  drafts,
  onDraftChange,
  onPlaceCommit,
  onOpen,
}: EventLocationsListProps) {
  if (asTable) {
    return (
      <EventLocationsTable
        rows={rows}
        drafts={drafts}
        onDraftChange={onDraftChange}
        onPlaceCommit={onPlaceCommit}
        onOpen={onOpen}
      />
    )
  }

  return (
    <ul className="stack-3">
      {rows.map((row) => (
        <EventLocationCard
          key={row.id}
          row={row}
          draft={drafts[row.id]}
          onDraftChange={onDraftChange}
          onPlaceCommit={onPlaceCommit}
          onOpen={onOpen}
        />
      ))}
    </ul>
  )
}

function EventLocationsTable({
  rows,
  drafts,
  onDraftChange,
  onPlaceCommit,
  onOpen,
}: Omit<EventLocationsListProps, 'asTable'>) {
  return (
    <div className="table-wrap table-wrap--event-locations">
      <table className="table table--event-locations">
        <thead>
          <tr>
            <th scope="col">מספר אירוע</th>
            <th scope="col">תאריך</th>
            <th scope="col">אחמ״ש</th>
            <th scope="col">כביש ומיקום</th>
            <th scope="col">כתובת במפה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const missing = eventLocationIsMissing(row)
            return (
              <tr
                key={row.id}
                className={missing ? 'table-row--missing-map' : undefined}
                onClick={() => onOpen(row.id)}
              >
                <td className={`num ${monoClass(row.police_event_id)}`}>
                  {row.police_event_id ?? '—'}
                </td>
                <td className="num mono">{formatDate(row.event_date)}</td>
                <td>
                  <LocationLeadCaption row={row} showOverflow />
                </td>
                <td className="truncate">{roadAndLocation(row)}</td>
                <td
                  className="table-cell--maps"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MapsField
                    row={row}
                    draft={drafts[row.id]}
                    onDraftChange={onDraftChange}
                    onPlaceCommit={onPlaceCommit}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
