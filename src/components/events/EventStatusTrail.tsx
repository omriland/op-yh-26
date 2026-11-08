import { HoverTip } from '../ui/HoverTip'
import { EVENT_LIFECYCLE_ORDER, lifecycleStamp, type LifecycleState } from '../../lib/eventLifecycle'
import type { ParticipationStatus } from '../../lib/status'

type TrailResponder = {
  id: string
  status: ParticipationStatus
  name: string
}

type EventStatusTrailProps = {
  state: LifecycleState
  responders?: TrailResponder[]
  /** Lead-facing: fields that still keep the event from being fully logged. */
  missingFields?: string[]
}

type TrailPhase = 'past' | 'current' | 'future'

/** Desktop Events table: the five-step lifecycle, current label under the active node. */
export function EventStatusTrail({
  state,
  responders = [],
  missingFields = [],
}: EventStatusTrailProps) {
  const currentIndex = EVENT_LIFECYCLE_ORDER.indexOf(state.status)
  const steps = EVENT_LIFECYCLE_ORDER.map((stepStatus, index) => {
    const phase: TrailPhase =
      index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future'
    return { status: stepStatus, phase, tone: lifecycleStamp(stepStatus, 'lead').tone }
  })
  const current = lifecycleStamp(state, 'lead')
  const done = responders.filter((row) => row.status === 'done')
  const draft = responders.filter((row) => row.status === 'in_progress')
  const pending = responders.filter((row) => row.status === 'pending')
  const showTip =
    missingFields.length > 0 ||
    (responders.length > 0 && state.status !== 'draft' && state.status !== 'done')

  const label = (
    <span className={`event-status-trail__label event-status-trail__label--${current.tone}`}>
      {current.label}
    </span>
  )
  const spoken = current.progress
    ? `${current.label}, ${current.progress.done} מתוך ${current.progress.total} תיעדו`
    : current.label

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
          <p className="hover-tip__heading">תיעדו</p>
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
    <div className="event-status-trail" aria-label={spoken}>
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
                step.phase === 'current' ? `event-status-trail__node--tone-${step.tone}` : '',
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
