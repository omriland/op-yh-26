import type { ReactNode } from 'react'
import type { StampDescriptor } from '../../lib/status'
import { StampChip } from './StampChip'
import { HoverTip } from './HoverTip'

type StampWithNoteProps = StampDescriptor & {
  note?: string | null
  header?: boolean
  press?: boolean
  /** Hover / tap: what still keeps the event from being fully logged. */
  tip?: string | null
  tipContent?: ReactNode
}

export function StampWithNote({
  note,
  header,
  press,
  tip,
  tipContent,
  ...stamp
}: StampWithNoteProps) {
  const chip = <StampChip {...stamp} header={header} press={press} />
  const hasTip = Boolean(tipContent) || Boolean(tip?.trim())
  const stamped = hasTip ? (
    <HoverTip text={tip ?? ''} content={tipContent} mode="always">
      {chip}
    </HoverTip>
  ) : (
    chip
  )
  if (!note) return stamped
  return (
    <span className="stamp-stack">
      {stamped}
      <span className="stamp-stack__note t-caption">{note}</span>
    </span>
  )
}
