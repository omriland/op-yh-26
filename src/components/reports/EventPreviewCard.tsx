import { forwardRef, type CSSProperties } from 'react'
import { Snowflake } from 'lucide-react'
import { Ledger, LedgerRow } from '../ui/Ledger'
import { Skeleton } from '../ui/Skeleton'
import { EventFrozenNotice } from '../events/EventFrozenNotice'
import type { FreezeViewer } from '../../lib/eventFreeze'
import {
  buildEventPreview,
  eventPreviewLabel,
  type EventPreview,
  type EventPreviewSource,
} from '../../lib/eventPreview'
import type { EventDetailCacheEntry } from '../../lib/hoverPreviewController'

const FALLBACK_LABEL = 'תצוגה מקדימה של אירוע'
const LOADING_TEXT = 'טוען את פרטי האירוע'
const ERROR_TEXT = 'לא הצלחנו לטעון את פרטי האירוע. לחיצה על השורה פותחת את האירוע.'
const MISSING_TEXT = 'האירוע לא נמצא. ייתכן שנמחק.'

type EventPreviewCardProps = {
  id: string
  entry: EventDetailCacheEntry<EventPreviewSource>
  viewer: FreezeViewer
  style: CSSProperties
  onPointerEnter: () => void
  onPointerLeave: () => void
}

export const EventPreviewCard = forwardRef<HTMLDivElement, EventPreviewCardProps>(
  function EventPreviewCard({ id, entry, viewer, style, onPointerEnter, onPointerLeave }, ref) {
    const label = entry.status === 'ready' ? eventPreviewLabel(entry.detail) : FALLBACK_LABEL
    return (
      <div
        ref={ref}
        id={id}
        role="region"
        aria-label={label}
        className="event-preview"
        style={style}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <div role="status" aria-live="polite">
          <EventPreviewBody entry={entry} viewer={viewer} />
        </div>
      </div>
    )
  },
)

function EventPreviewBody({
  entry,
  viewer,
}: {
  entry: EventDetailCacheEntry<EventPreviewSource>
  viewer: FreezeViewer
}) {
  if (entry.status === 'ready') {
    return <EventPreviewDetails preview={buildEventPreview(entry.detail)} viewer={viewer} />
  }
  if (entry.status === 'error') return <p className="t-caption">{ERROR_TEXT}</p>
  if (entry.status === 'missing') return <p className="t-caption">{MISSING_TEXT}</p>
  return (
    <div className="stack-2">
      <span className="visually-hidden">{LOADING_TEXT}</span>
      <Skeleton height={24} width="50%" />
      <Skeleton height={20} />
      <Skeleton height={20} />
      <Skeleton height={20} width="70%" />
    </div>
  )
}

function EventPreviewDetails({ preview, viewer }: { preview: EventPreview; viewer: FreezeViewer }) {
  return (
    <div className="stack-3">
      <h3 className="t-body-strong">{preview.title}</h3>
      <EventFrozenNotice event={preview.freezeFlags} viewer={viewer} />
      <Ledger>
        {preview.rows.map((row) => (
          <LedgerRow key={row.label} label={row.label} value={row.value} numeric />
        ))}
      </Ledger>
      <EventPreviewResponders preview={preview} />
    </div>
  )
}

function EventPreviewResponders({ preview }: { preview: EventPreview }) {
  if (preview.responderCount === 0) {
    return <p className="t-caption text-muted">לא שובצו מתנדבים לאירוע זה.</p>
  }
  return (
    <section className="stack-2" aria-label="מתנדבים">
      <p className="t-label text-secondary">
        מתנדבים ({preview.responderCount})
        {preview.totalKmLabel ? ` · סה״כ ${preview.totalKmLabel}` : ''}
      </p>
      <ul className="event-preview__responders">
        {preview.responders.map((responder) => (
          <li key={responder.id} className="event-preview__responder">
            <span className="event-preview__responder-name">
              {responder.name}
              {responder.callsign ? <span className="text-muted"> · {responder.callsign}</span> : null}
              {responder.frozen ? (
                <span className="event-preview__frozen">
                  <Snowflake size={16} strokeWidth={1.75} aria-hidden="true" /> מוקפא
                </span>
              ) : null}
            </span>
            <span className="mono">{responder.kmLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
