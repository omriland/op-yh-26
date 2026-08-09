import type { StampDescriptor } from '../../lib/status'

type StampChipProps = StampDescriptor & {
  /** Event-detail letterhead stamp: larger and rotated −1.5°. */
  header?: boolean
  /** Only for live status transitions — never on page load or in lists. */
  press?: boolean
}

export function StampChip({ label, tone, header = false, press = false }: StampChipProps) {
  return (
    <span
      className={['stamp', `stamp--${tone}`, header ? 'stamp--header' : '', press ? 'stamp--press' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  )
}
