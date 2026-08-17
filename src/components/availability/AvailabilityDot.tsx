import type { AvailabilityStatus } from '../../lib/availability'
import { availabilityLabel } from '../../lib/availability'

export function AvailabilityDot({
  status,
}: {
  status: AvailabilityStatus
}) {
  const label = availabilityLabel(status)
  return (
    <span
      className={`availability-dot availability-dot--${status}`}
      title={label}
    >
      <span className="availability-dot__halo" aria-hidden="true" />
      <span className="availability-dot__core" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

export function AvailabilityStatusMark({
  status,
  caption,
}: {
  status: AvailabilityStatus
  caption?: string | null
}) {
  return (
    <span className="availability-status">
      <AvailabilityDot status={status} />
      <span className="availability-status__copy">
        <span className="t-body" aria-hidden="true">
          {availabilityLabel(status)}
        </span>
        {caption ? <span className="t-caption text-muted">{caption}</span> : null}
      </span>
    </span>
  )
}
