import type { StampDescriptor } from '../../lib/status'
import { StampChip } from './StampChip'

type StampWithNoteProps = StampDescriptor & {
  note?: string | null
  header?: boolean
  press?: boolean
}

export function StampWithNote({ note, header, press, ...stamp }: StampWithNoteProps) {
  if (!note) {
    return <StampChip {...stamp} header={header} press={press} />
  }
  return (
    <span className="stamp-stack">
      <StampChip {...stamp} header={header} press={press} />
      <span className="stamp-stack__note t-caption">{note}</span>
    </span>
  )
}
