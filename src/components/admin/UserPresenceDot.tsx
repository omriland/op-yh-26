import type { PresenceStatus } from '../../lib/userPresence'

const LABELS: Record<PresenceStatus, string> = {
  now: 'פעיל עכשיו',
  recent: 'פעיל לאחרונה',
}

export function UserPresenceDot({ status }: { status: PresenceStatus }) {
  const label = LABELS[status]
  return (
    <span className={`user-presence user-presence--${status}`} title={label}>
      <span className="user-presence__disc" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
