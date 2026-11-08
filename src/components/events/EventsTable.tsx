import { useMemo, useRef, type MouseEvent } from 'react'
import { formatDate, monoClass } from '../../lib/format'
import { doneFraction, type EventListItem, type EventResponderSummary } from '../../lib/events'
import { mapSecondaryLeadRows } from '../../lib/eventShiftLeads'
import type { FreezeViewer } from '../../lib/eventFreeze'
import type { EventStatus } from '../../lib/status'
import { HoverTip } from '../ui/HoverTip'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { isoSortValue, type TableSort } from '../../lib/tableSort'
import { EventListLeadCaption } from './EventListLeadCaption'
import { EventTypeLabel } from './EventTypeLabel'
import { EventFrozenMark } from './EventFrozenMark'
import { EventStatusTrail } from './EventStatusTrail'
import { EventAttachmentMark } from './EventAttachmentMark'
import { IncompleteFieldsNotice } from './IncompleteFieldsNotice'
import { leadFacingMissingKm, missingFullyLoggedFieldLabels } from '../../lib/eventIncomplete'

type IncompleteNotice = {
  fields: string[]
  spoken: string
}

type EventsTableProps = {
  events: EventListItem[]
  onOpen: (eventId: string) => void
  /** Freeze reader. Without it the table shows no freeze marks. */
  viewer?: FreezeViewer | null
  /** Current user — lead-facing חסר ק״מ only when they lead this event. */
  viewerId?: string
  onContextDelete?: (event: EventListItem, pointer: { x: number; y: number }) => void
  /** Unit list: missing required fields as a full-width ledger line under the data row. */
  incompleteNoticeFor?: (event: EventListItem) => IncompleteNotice | undefined
  /** Ledger queue title for the pinned incomplete table. */
  caption?: string
  /** Search results: why each row matched, as a full-width `נמצא לפי` line under the row. */
  foundBy?: (event: EventListItem) => string
  /** The order `events` arrive in; null when it follows no column (search results). */
  defaultSort?: TableSort | null
  /** Shared sort when a page shows two event tables that should order alike. */
  sort?: TableSort | null
  onSortChange?: (next: TableSort) => void
  partialSortNote?: string
}

const NO_ASSIGNED_RESPONDERS = 'אין מתנדבים משובצים'

/** Same identity the status trail already uses for a responder on this table. */
export function responderDisplayName(
  profile: { full_name?: string | null; callsign?: string | null } | null | undefined,
): string {
  return profile?.full_name ?? profile?.callsign ?? 'מתנדב'
}

export function AssignedRespondersTip({
  responders,
}: {
  responders: EventResponderSummary[]
}) {
  if (responders.length === 0) {
    return <p className="hover-tip__empty">{NO_ASSIGNED_RESPONDERS}</p>
  }
  return (
    <ul className="hover-tip__list">
      {responders.map((row) => (
        <li key={row.id}>{responderDisplayName(row.profile)}</li>
      ))}
    </ul>
  )
}

const DATE_DESC: TableSort = { columnId: 'date', direction: 'desc' }

function locationLabelOf(event: EventListItem): string {
  return [event.road?.name, event.location].filter(Boolean).join(' · ') || '—'
}

function leadSortName(event: EventListItem): string | null {
  return event.origin === 'shift' ? null : (event.shift_lead?.full_name ?? null)
}

const STATUS_ORDER: Record<EventStatus, number> = { draft: 0, in_progress: 1, partial: 2, done: 3 }

function eventColumns(viewer: FreezeViewer | null | undefined, viewerId?: string): DataTableColumn<EventListItem>[] {
  return [
    {
      id: 'date',
      header: 'תאריך',
      className: 'num mono',
      sortValue: (event) => isoSortValue(event.event_date),
      cell: (event) => formatDate(event.event_date),
    },
    {
      id: 'police',
      header: 'מספר אירוע',
      className: (event) => `num ${monoClass(event.police_event_id)}`,
      sortValue: (event) => event.police_event_id,
      cell: (event) => event.police_event_id ?? '—',
    },
    {
      id: 'type',
      header: 'סוג אירוע',
      sortValue: (event) => event.event_type?.name,
      cell: (event) => (
        <span className="event-card__type">
          <EventFrozenMark event={event} viewer={viewer} />
          <EventTypeLabel event={event} />
        </span>
      ),
    },
    {
      id: 'place',
      header: 'כביש / מיקום',
      className: 'table-col--location',
      headerClassName: 'table-col--location',
      sortValue: (event) => {
        const label = locationLabelOf(event)
        return label === '—' ? null : label
      },
      cell: (event) => {
        const label = locationLabelOf(event)
        return (
          <HoverTip text={label === '—' ? '' : label} className="table-col--location__text">
            {label}
          </HoverTip>
        )
      },
    },
    {
      id: 'lead',
      header: 'אחמ״ש',
      sortValue: leadSortName,
      cell: (event) =>
        event.origin === 'shift' ? (
          '—'
        ) : (
          <EventListLeadCaption
            main={event.shift_lead}
            secondaries={mapSecondaryLeadRows(event.secondary_leads)}
            showOverflow
          />
        ),
    },
    {
      id: 'responders',
      header: 'מתנדבים',
      className: 'num mono',
      // Shown as done/assigned: order by assigned, then by how many are done.
      sortValue: (event) =>
        event.responders.length + event.responders.filter((row) => row.status === 'done').length / 1000,
      cell: (event) => (
        <HoverTip
          mode="always"
          pinOnClick={false}
          className="events-table__responders"
          content={<AssignedRespondersTip responders={event.responders} />}
        >
          {doneFraction(event)}
        </HoverTip>
      ),
    },
    {
      id: 'status',
      header: 'סטטוס תיעוד',
      className: 'table-cell--status',
      sortValue: (event) => STATUS_ORDER[event.status] ?? null,
      cell: (event) => (
        <div className="table-cell--status__row">
          <EventStatusTrail
            status={event.status}
            missingKm={leadFacingMissingKm(event, viewerId)}
            missingFields={
              event.status === 'partial' || event.status === 'in_progress'
                ? missingFullyLoggedFieldLabels(event, viewerId)
                : []
            }
            responders={event.responders.map((row) => ({
              id: row.id,
              status: row.status,
              name: responderDisplayName(row.profile),
            }))}
          />
          {event.has_image ? <EventAttachmentMark /> : null}
        </div>
      ),
    },
  ]
}

/** Command desktop only — mobile renders the same data as cards. */
export function EventsTable({
  events,
  onOpen,
  viewer,
  viewerId,
  onContextDelete,
  incompleteNoticeFor,
  caption,
  foundBy,
  defaultSort = DATE_DESC,
  sort,
  onSortChange,
  partialSortNote,
}: EventsTableProps) {
  const skipOpenUntil = useRef(0)
  const columns = useMemo(() => eventColumns(viewer, viewerId), [viewer, viewerId])

  const openRow = (event: EventListItem) => {
    if (Date.now() < skipOpenUntil.current) return
    onOpen(event.id)
  }
  const contextMenuFor = (event: EventListItem) =>
    onContextDelete
      ? (click: MouseEvent<HTMLTableRowElement>) => {
          click.preventDefault()
          click.stopPropagation()
          skipOpenUntil.current = Date.now() + 400
          onContextDelete(event, { x: click.clientX, y: click.clientY })
        }
      : undefined
  const isIncomplete = (event: EventListItem) => {
    const notice = incompleteNoticeFor?.(event)
    return Boolean(notice && notice.fields.length > 0)
  }

  return (
    <DataTable
      rows={events}
      columns={columns}
      rowKey={(event) => event.id}
      defaultSort={defaultSort}
      sort={sort}
      onSortChange={onSortChange}
      partialSortNote={partialSortNote}
      caption={caption}
      captionClassName="events-incomplete-heading"
      className="table--events"
      wrapClassName="table-wrap--events"
      onRowClick={openRow}
      rowLabel={(event) => `פתיחת אירוע ${event.police_event_id ?? formatDate(event.event_date)}`}
      rowProps={(event) => ({ onContextMenu: contextMenuFor(event) })}
      rowClassName={(event) => {
        const incomplete = isIncomplete(event)
        return (
          [
            event.status === 'done' && !incomplete ? 'table-row--done' : '',
            incomplete ? 'table-row--needs-completion' : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined
        )
      }}
      renderSubRows={(event, colSpan) => {
        const notice = incompleteNoticeFor?.(event)
        const incomplete = Boolean(notice && notice.fields.length > 0)
        const reason = foundBy?.(event)
        const onContextMenu = contextMenuFor(event)
        const openOnClick = (click: MouseEvent<HTMLTableRowElement>) => {
          if (click.button !== 0) return
          openRow(event)
        }
        return (
          <>
            {incomplete && notice ? (
              <tr
                className="table-row--completion-meta"
                onClick={openOnClick}
                onContextMenu={onContextMenu}
              >
                <td colSpan={colSpan}>
                  <IncompleteFieldsNotice fields={notice.fields} spoken={notice.spoken} />
                </td>
              </tr>
            ) : null}
            {reason ? (
              <tr
                className={`table-row--found-by${event.status === 'done' && !incomplete ? ' table-row--done' : ''}`}
                onClick={openOnClick}
                onContextMenu={onContextMenu}
              >
                <td colSpan={colSpan}>
                  <p className="t-caption events-table__found-by">
                    <span className="text-secondary">נמצא לפי:</span> {reason}
                  </p>
                </td>
              </tr>
            ) : null}
          </>
        )
      }}
    />
  )
}
