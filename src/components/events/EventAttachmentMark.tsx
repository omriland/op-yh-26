import { Paperclip } from 'lucide-react'

export const EVENT_ATTACHMENT_LABEL = 'יש תמונה מצורפת'

/** Paperclip beside the status when the event has at least one photo. */
export function EventAttachmentMark() {
  return (
    <span className="event-attachment" title={EVENT_ATTACHMENT_LABEL}>
      <Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
      <span className="visually-hidden">{EVENT_ATTACHMENT_LABEL}</span>
    </span>
  )
}
