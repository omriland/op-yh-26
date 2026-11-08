import type { StampDescriptor } from '../../lib/status'

type StampChipProps = StampDescriptor & {
  /** Event-detail letterhead stamp: larger and rotated −8°. */
  header?: boolean
  /** Only for live status transitions — never on page load or in lists. */
  press?: boolean
}

export function StampChip({ label, tone, progress, header = false, press = false }: StampChipProps) {
  return (
    <span
      className={['stamp', `stamp--${tone}`, header ? 'stamp--header' : '', press ? 'stamp--press' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {label}
      {progress ? (
        <>
          <span className="stamp__progress" dir="ltr" aria-hidden="true">
            {`${progress.done}/${progress.total}`}
          </span>
          <span className="visually-hidden">{`, ${progress.done} מתוך ${progress.total} תיעדו`}</span>
        </>
      ) : null}
    </span>
  )
}
