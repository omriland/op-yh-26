import { CircleHelp } from 'lucide-react'
import {
  eventFormFieldNote,
  type EventFormFieldNoteId,
} from '../../lib/eventFormFieldNotes'
import { HoverTip } from './HoverTip'

type FieldNoteProps = {
  /** Event-form registry key. Copy lives in `eventFormFieldNotes.ts`. */
  field?: EventFormFieldNoteId
  /** Explicit Hebrew note. Wins over the registry when both are set. */
  note?: string
  /** Explicit Hebrew tooltip. Absent (and no registry tooltip) → no icon. */
  tooltip?: string
}

/**
 * Short note above a field (or field group), with an optional tap/keyboard tooltip.
 * Hover is never the only way to open the tip (`HoverTip` `mode="always"`).
 */
export function FieldNote({ field, note, tooltip }: FieldNoteProps) {
  const fromRegistry = field ? eventFormFieldNote(field) : undefined
  const text = (note ?? fromRegistry?.note)?.trim() ?? ''
  const tip = (tooltip ?? fromRegistry?.tooltip)?.trim() ?? ''

  if (!text && !tip) return null

  return (
    <div className="field-note">
      {text ? <p className="field-note__text">{text}</p> : null}
      {tip ? (
        <HoverTip text={tip} mode="always" className="field-note__tip" tabIndex={-1}>
          <CircleHelp size={17} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">מידע נוסף</span>
        </HoverTip>
      ) : null}
    </div>
  )
}
