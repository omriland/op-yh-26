import { Fragment, useRef, type MouseEvent } from 'react'
import { formatDate, monoClass } from '../../lib/format'
import { doneFraction, type EventListItem } from '../../lib/events'
import { mapSecondaryLeadRows } from '../../lib/eventShiftLeads'
import { HoverTip } from '../ui/HoverTip'
import { EventListLeadCaption } from './EventListLeadCaption'
import { EventTypeLabel } from './EventTypeLabel'
import { EventFrozenMark } from './EventFrozenMark'
import { EventStatusTrail } from './EventStatusTrail'
import { IncompleteFieldsNotice } from './IncompleteFieldsNotice'

type IncompleteNotice = {
  fields: string[]
  spoken: string
}

type EventsTableProps = {
  events: EventListItem[]
  onOpen: (eventId: string) => void
  onContextDelete?: (event: EventListItem, pointer: { x: number; y: number }) => void
  /** Unit list: missing required fields as a full-width ledger line under the data row. */
  incompleteNoticeFor?: (event: EventListItem) => IncompleteNotice | undefined
  /** Ledger queue title for the pinned incomplete table. */
  caption?: string
}

/** Command desktop only — mobile renders the same data as cards. */
export function EventsTable({
  events,
  onOpen,
  onContextDelete,
  incompleteNoticeFor,
  caption,
}: EventsTableProps) {
  const skipOpenUntil = useRef(0)

  return (
    <div className="table-wrap">
      <table className="table table--events">
        {caption ? <caption className="events-incomplete-heading">{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">מספר אירוע</th>
            <th scope="col">סוג אירוע</th>
            <th scope="col">כביש / מיקום</th>
            <th scope="col">אחמ״ש</th>
            <th scope="col">מתנדבים</th>
            <th scope="col">סטטוס תיעוד</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const locationLabel =
              [event.road?.name, event.location].filter(Boolean).join(' · ') || '—'
            const notice = incompleteNoticeFor?.(event)
            const incomplete = Boolean(notice && notice.fields.length > 0)
            const rowClass = [
              event.status === 'done' && !incomplete ? 'table-row--done' : '',
              incomplete ? 'table-row--needs-completion' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const openRow = () => {
              if (Date.now() < skipOpenUntil.current) return
              onOpen(event.id)
            }
            const onContextMenu = onContextDelete
              ? (click: MouseEvent<HTMLTableRowElement>) => {
                  click.preventDefault()
                  click.stopPropagation()
                  skipOpenUntil.current = Date.now() + 400
                  onContextDelete(event, { x: click.clientX, y: click.clientY })
                }
              : undefined
            return (
              <Fragment key={event.id}>
                <tr
                  className={rowClass || undefined}
                  onClick={(click) => {
                    if (click.button !== 0) return
                    openRow()
                  }}
                  onContextMenu={onContextMenu}
                >
                  <td className="num mono">{formatDate(event.event_date)}</td>
                  <td className={`num ${monoClass(event.police_event_id)}`}>
                    {event.police_event_id ?? '—'}
                  </td>
                  <td>
                    <span className="event-card__type">
                      <EventFrozenMark flags={event} />
                      <EventTypeLabel event={event} />
                    </span>
                  </td>
                  <td className="table-col--location">
                    <HoverTip
                      text={locationLabel === '—' ? '' : locationLabel}
                      className="table-col--location__text"
                    >
                      {locationLabel}
                    </HoverTip>
                  </td>
                  <td>
                    {event.origin === 'shift' ? (
                      '—'
                    ) : (
                      <EventListLeadCaption
                        main={event.shift_lead}
                        secondaries={mapSecondaryLeadRows(event.secondary_leads)}
                        showOverflow
                      />
                    )}
                  </td>
                  <td className="num mono">{doneFraction(event)}</td>
                  <td className="table-cell--status">
                    <EventStatusTrail
                      status={event.status}
                      responders={event.responders.map((row) => ({
                        id: row.id,
                        status: row.status,
                        name: row.profile?.full_name ?? row.profile?.callsign ?? 'מתנדב',
                      }))}
                    />
                  </td>
                </tr>
                {incomplete && notice ? (
                  <tr
                    className="table-row--completion-meta"
                    onClick={(click) => {
                      if (click.button !== 0) return
                      openRow()
                    }}
                    onContextMenu={onContextMenu}
                  >
                    <td colSpan={7}>
                      <IncompleteFieldsNotice fields={notice.fields} spoken={notice.spoken} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
