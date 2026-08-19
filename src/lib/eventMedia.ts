export const EVENT_MEDIA_CAP = 20
export const EVENT_MEDIA_CAPTION_MAX = 200
export const EVENT_MEDIA_LEFTOVER_ERROR = 'בחרו מתי צולמה כל תמונה.'
export const EVENT_MEDIA_CAP_ERROR = 'ניתן לצרף עד 20 תמונות לאירוע.'
export const EVENT_MEDIA_CAPTION_ERROR = 'התיאור קצר עד 200 תווים.'
export const EVENT_MEDIA_BAD_TYPE = 'לא ניתן להעלות קובץ זה. בחרו תמונה.'
export const EVENT_MEDIA_TOO_LARGE = 'הקובץ גדול מדי. בחרו תמונה אחרת.'
export const EVENT_MEDIA_COMPRESS_FAIL = 'לא הצלחנו לדחוס את התמונה. נסו תמונה אחרת.'
export const EVENT_MEDIA_HEIC_FAIL =
  'לא הצלחנו לקרוא את התמונה. שמרו כ-JPEG או PNG ונסו שוב.'
export const EVENT_MEDIA_NETWORK = 'ההעלאה נכשלה. נסו שוב.'
export const EVENT_MEDIA_EMPTY_DETAIL = 'אין תמונות לאירוע זה.'
export const EVENT_MEDIA_ADDED = 'התמונה נוספה'
export const EVENT_MEDIA_UPDATED = 'התמונה עודכנה'
export const EVENT_MEDIA_DELETED = 'התמונה נמחקה'

export type EventMediaTakenWhen = 'before_treatment' | 'during_after_treatment'

export const EVENT_MEDIA_TAKEN_WHEN_LABEL: Record<EventMediaTakenWhen, string> = {
  before_treatment: 'לפני הטיפול',
  during_after_treatment: 'במהלך/לאחר הטיפול',
}

export type EventMedia = {
  id: string
  event_id: string
  uploaded_by: string
  uploader_name: string | null
  treated_plate_id: string | null
  caption: string | null
  taken_when: EventMediaTakenWhen
  storage_path: string
  mime_type: string
  byte_size: number
  width: number | null
  height: number | null
  created_at: string
  signed_url: string | null
}

export function leftoverEventMediaError(
  unfinishedDraftCount: number,
  mode: 'draft' | 'complete',
): string | undefined {
  if (mode !== 'complete') return undefined
  if (unfinishedDraftCount <= 0) return undefined
  return EVENT_MEDIA_LEFTOVER_ERROR
}

export function captionError(caption: string): string | undefined {
  if (caption.length <= EVENT_MEDIA_CAPTION_MAX) return undefined
  return EVENT_MEDIA_CAPTION_ERROR
}

export function slotsRemaining(savedCount: number, inFlightCount: number): number {
  return Math.max(0, EVENT_MEDIA_CAP - savedCount - inFlightCount)
}

export function canAddMoreMedia(savedCount: number, inFlightCount: number): boolean {
  return slotsRemaining(savedCount, inFlightCount) > 0
}

export function groupMediaByTakenWhen(items: readonly EventMedia[]): {
  before: EventMedia[]
  during: EventMedia[]
} {
  const byCreated = (a: EventMedia, b: EventMedia) => a.created_at.localeCompare(b.created_at)
  return {
    before: items.filter((row) => row.taken_when === 'before_treatment').sort(byCreated),
    during: items.filter((row) => row.taken_when === 'during_after_treatment').sort(byCreated),
  }
}

export function eventMediaStoragePath(eventId: string, mediaId: string): string {
  return `${eventId}/${mediaId}.jpg`
}
