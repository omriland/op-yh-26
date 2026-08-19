import { supabase } from './supabase'

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

export type EventMediaPlateOption = { id: string; plate_number: string }

export function mergeMediaPlates(
  responderKeyed: readonly EventMediaPlateOption[],
  eventKeyed: readonly EventMediaPlateOption[],
): EventMediaPlateOption[] {
  const seen = new Set<string>()
  const out: EventMediaPlateOption[] = []
  for (const row of [...responderKeyed, ...eventKeyed]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

export function mapEventMediaError(message: string | undefined): string {
  if (message?.includes('event_media_cap')) return EVENT_MEDIA_CAP_ERROR
  return EVENT_MEDIA_NETWORK
}

type EventMediaRow = {
  id: string
  event_id: string
  uploaded_by: string
  treated_plate_id: string | null
  caption: string | null
  taken_when: EventMediaTakenWhen
  storage_path: string
  mime_type: string
  byte_size: number
  width: number | null
  height: number | null
  created_at: string
  uploader?: { full_name: string | null } | { full_name: string | null }[] | null
}

const EVENT_MEDIA_SELECT =
  'id, event_id, uploaded_by, treated_plate_id, caption, taken_when, storage_path, mime_type, byte_size, width, height, created_at, uploader:profiles!event_media_uploaded_by_fkey(full_name)'

function uploaderName(row: EventMediaRow): string | null {
  const uploader = row.uploader
  if (!uploader) return null
  if (Array.isArray(uploader)) return uploader[0]?.full_name ?? null
  return uploader.full_name ?? null
}

async function withSignedUrl(row: EventMediaRow): Promise<EventMedia> {
  const { data } = await supabase.storage
    .from('event-media')
    .createSignedUrl(row.storage_path, 3600)
  return {
    id: row.id,
    event_id: row.event_id,
    uploaded_by: row.uploaded_by,
    uploader_name: uploaderName(row),
    treated_plate_id: row.treated_plate_id,
    caption: row.caption,
    taken_when: row.taken_when,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    width: row.width,
    height: row.height,
    created_at: row.created_at,
    signed_url: data?.signedUrl ?? null,
  }
}

export async function listEventMedia(eventId: string): Promise<EventMedia[]> {
  const { data, error } = await supabase
    .from('event_media')
    .select(EVENT_MEDIA_SELECT)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return Promise.all((data as EventMediaRow[]).map(withSignedUrl))
}

export async function listEventMediaPlates(eventId: string): Promise<EventMediaPlateOption[]> {
  const [eventKeyed, responderKeyed] = await Promise.all([
    supabase
      .from('event_treated_plates')
      .select('id, plate_number')
      .eq('event_id', eventId),
    supabase
      .from('event_treated_plates')
      .select('id, plate_number, event_responders!event_treated_plates_event_responder_id_fkey!inner(event_id)')
      .eq('event_responders.event_id', eventId),
  ])
  return mergeMediaPlates(
    (responderKeyed.data ?? []) as EventMediaPlateOption[],
    (eventKeyed.data ?? []) as EventMediaPlateOption[],
  )
}

export async function uploadEventMedia(input: {
  eventId: string
  blob: Blob
  width: number
  height: number
  takenWhen: EventMediaTakenWhen
  treatedPlateId: string | null
  caption: string | null
}): Promise<{ ok: true; media: EventMedia } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: EVENT_MEDIA_NETWORK }

  const caption = input.caption?.trim() || null
  if (caption && captionError(caption)) {
    return { ok: false, error: captionError(caption)! }
  }

  const id = crypto.randomUUID()
  const storage_path = eventMediaStoragePath(input.eventId, id)
  const { error: uploadError } = await supabase.storage
    .from('event-media')
    .upload(storage_path, input.blob, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) return { ok: false, error: mapEventMediaError(uploadError.message) }

  const { data, error } = await supabase
    .from('event_media')
    .insert({
      id,
      event_id: input.eventId,
      uploaded_by: user.id,
      treated_plate_id: input.treatedPlateId,
      caption,
      taken_when: input.takenWhen,
      storage_path,
      mime_type: 'image/jpeg',
      byte_size: input.blob.size,
      width: input.width,
      height: input.height,
    })
    .select(EVENT_MEDIA_SELECT)
    .single()

  if (error || !data) {
    await supabase.storage.from('event-media').remove([storage_path])
    return { ok: false, error: mapEventMediaError(error?.message) }
  }

  return { ok: true, media: await withSignedUrl(data as EventMediaRow) }
}

export async function updateEventMedia(input: {
  id: string
  takenWhen: EventMediaTakenWhen
  treatedPlateId: string | null
  caption: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const caption = input.caption?.trim() || null
  if (caption && captionError(caption)) {
    return { ok: false, error: captionError(caption)! }
  }
  const { error } = await supabase
    .from('event_media')
    .update({
      taken_when: input.takenWhen,
      treated_plate_id: input.treatedPlateId,
      caption,
    })
    .eq('id', input.id)
  if (error) return { ok: false, error: mapEventMediaError(error.message) }
  return { ok: true }
}

export async function deleteEventMedia(input: {
  id: string
  storagePath: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('event_media').delete().eq('id', input.id)
  if (error) return { ok: false, error: mapEventMediaError(error.message) }
  await supabase.storage.from('event-media').remove([input.storagePath])
  return { ok: true }
}
