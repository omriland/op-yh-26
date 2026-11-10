import { HoverTip } from '../ui/HoverTip'
import {
  eventStatusTrailSteps,
  reportingDocumentationStamp,
  type EventStatus,
  type ParticipationStatus,
  type StampDescriptor,
} from '../../lib/status'

type TrailResponder = {
  id: string
  status: ParticipationStatus
  name: string
}

type EventStatusTrailProps = {
  status: EventStatus
  missingKm?: boolean
  responders?: TrailResponder[]
  /** Lead-facing: fields that still keep the event from being fully logged. */
  missingFields?: string[]
  /** Lead-facing override for the current label (הוזן בהצלחה + caption). */
  stamp?: StampDescriptor | null
}

/** Desktop Events table — compact pipeline with current label under the active node. */
export function EventStatusTrail({
  status,
  missingKm = false,
  responders = [],
  missingFields = [],
  stamp = null,
}: EventStatusTrailProps) {
  const steps = eventStatusTrailSteps(status, { missingKm })
  const current = stamp ?? reportingDocumentationStamp(status, missingKm)
  const done = responders.filter((row) => row.status === 'done')
  const draft = responders.filter((row) => row.status === 'in_progress')
  const pending = responders.filter((row) => row.status === 'pending')
  const showTip =
    missingFields.length > 0 ||
    (responders.length > 0 &&
      (status === 'partial' || status === 'in_progress' || draft.length > 0))

  const label = (
    <span className={`event-status-trail__label event-status-trail__label--${current.tone}`}>
      {current.label}
      {current.caption ? (
        <span className="event-status-trail__caption t-caption">{current.caption}</span>
      ) : null}
    </span>
  )

  const tipContent = (
    <div className="hover-tip__sections">
      {missingFields.length > 0 ? (
        <section className="hover-tip__section">
          <p className="hover-tip__heading">חסרים</p>
          <ul className="hover-tip__list">
            {missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {done.length > 0 ? (
        <section className="hover-tip__section">
          <p className="hover-tip__heading">הושלם</p>
          <ul className="hover-tip__list">
            {done.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {draft.length > 0 ? (
        <section className="hover-tip__section">
          <p className="hover-tip__heading">טיוטה נשמרה</p>
          <ul className="hover-tip__list">
            {draft.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {pending.length > 0 ? (
        <section className="hover-tip__section">
          <p className="hover-tip__heading">ממתין לתיעוד</p>
          <ul className="hover-tip__list">
            {pending.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )

  return (
    <div
      className="event-status-trail"
      aria-label={current.caption ? `${current.label}, ${current.caption}` : current.label}
    >
      <ol className="event-status-trail__steps">
        {steps.map((step) => (
          <li
            key={step.status}
            className={[
              'event-status-trail__step',
              `event-status-trail__step--${step.phase}`,
            ].join(' ')}
          >
            <span
              className={[
                'event-status-trail__node',
                `event-status-trail__node--${step.phase}`,
                step.phase === 'current' ? `event-status-trail__node--tone-${current.tone}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
            {step.phase === 'current' ? (
              showTip ? (
                <HoverTip mode="always" className="event-status-trail__tip-anchor" content={tipContent}>
                  {label}
                </HoverTip>
              ) : (
                label
              )
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
