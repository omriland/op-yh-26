import {
  EVENT_MEDIA_BAD_TYPE,
  EVENT_MEDIA_CAP_ERROR,
  EVENT_MEDIA_CAPTION_ERROR,
  EVENT_MEDIA_NETWORK,
  EVENT_MEDIA_TOO_LARGE,
  EVENT_MEDIA_VIDEO_TOO_LARGE,
  captionError,
  deleteEventMedia,
  linkPendingMedia,
  listEventMedia,
  listEventMediaPlates,
  setMediaSubject,
  uploadEventMedia,
  type EventMedia,
  type EventMediaPlateOption,
  type EventMediaTakenWhen,
  type MediaPlateOwner,
  type PendingMediaLink,
  type PhotoSubject,
} from './eventMedia'
import { fetchEventPhotoCoverage } from './eventVehiclePhotos'
import { supabaseAnon } from './supabase'

export type MediaUploadInput = {
  eventId: string
  blob: Blob
  mimeType: string
  width: number | null
  height: number | null
  takenWhen: EventMediaTakenWhen
  subject: PhotoSubject
  owner: MediaPlateOwner | null
  caption: string | null
}

export type MediaSubjectInput = {
  eventId: string
  mediaId: string
  subject: PhotoSubject
  owner: MediaPlateOwner | null
  takenWhen?: EventMediaTakenWhen
  caption?: string | null
}

type Failure = { ok: false; error: string }
type LinkResult = { ok: true; ids: string[]; pendingDigits: string[] } | Failure

/**
 * Where the photo gallery reads and writes. The logged-in app goes straight to the
 * database under RLS; the email-link form goes through responder-fill with the
 * fill token, which acts as that link's responder on that link's event only.
 */
export type EventMediaSource = {
  listMedia(eventId: string): Promise<EventMedia[]>
  listPlates(eventId: string): Promise<EventMediaPlateOption[]>
  upload(
    input: MediaUploadInput,
  ): Promise<{ ok: true; media: EventMedia; pendingDigits: string[] } | Failure>
  setSubject(input: MediaSubjectInput): Promise<LinkResult>
  remove(item: Pick<EventMedia, 'id' | 'storage_path'>): Promise<{ ok: true } | Failure>
  /** Links still waiting come back. */
  linkPending(
    eventId: string,
    links: readonly PendingMediaLink[],
    owner: MediaPlateOwner | null,
  ): Promise<PendingMediaLink[]>
  /** Plate digits with a linked photo, or null when the read failed. */
  coverage(eventId: string): Promise<Set<string> | null>
}

export const sessionMediaSource: EventMediaSource = {
  listMedia: listEventMedia,
  listPlates: listEventMediaPlates,
  upload: uploadEventMedia,
  setSubject: setMediaSubject,
  remove: (item) => deleteEventMedia({ id: item.id, storagePath: item.storage_path }),
  linkPending: linkPendingMedia,
  coverage: fetchEventPhotoCoverage,
}

const LINK_EXPIRED = 'קישור הדיווח אינו תקין או שפג תוקפו.'

/** Error codes from responder-fill's media actions, in the gallery's existing words. */
export function fillMediaErrorMessage(code: unknown, mimeType?: string): string {
  switch (code) {
    case 'cap':
      return EVENT_MEDIA_CAP_ERROR
    case 'bad_type':
      return EVENT_MEDIA_BAD_TYPE
    case 'too_large':
      return mimeType?.startsWith('video/') ? EVENT_MEDIA_VIDEO_TOO_LARGE : EVENT_MEDIA_TOO_LARGE
    case 'caption':
      return EVENT_MEDIA_CAPTION_ERROR
    case 'invalid':
    case 'expired':
      return LINK_EXPIRED
    default:
      return EVENT_MEDIA_NETWORK
  }
}

type CallResult<T> = { ok: true; data: T } | { ok: false; code: string | null }

async function callFillMedia<T>(
  fillToken: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<CallResult<T>> {
  try {
    const { data, error } = await supabaseAnon.functions.invoke('responder-fill', {
      body: { action, fill_token: fillToken, ...payload },
    })
    if (!error && data && typeof data === 'object') return { ok: true, data: data as T }
    const context = (error as { context?: Response } | null)?.context
    const body = context ? ((await context.json().catch(() => null)) as { code?: string } | null) : null
    return { ok: false, code: typeof body?.code === 'string' ? body.code : null }
  } catch {
    return { ok: false, code: null }
  }
}

/** The gallery's data access for the email-link form, authorised by the fill token. */
export function tokenMediaSource(fillToken: string): EventMediaSource {
  return {
    async listMedia() {
      const result = await callFillMedia<{ media?: EventMedia[] }>(fillToken, 'media_list')
      return result.ok ? (result.data.media ?? []) : []
    },

    async listPlates() {
      const result = await callFillMedia<{ plates?: EventMediaPlateOption[] }>(
        fillToken,
        'media_list',
        { plates_only: true },
      )
      return result.ok ? (result.data.plates ?? []) : []
    },

    async upload(input) {
      const caption = input.caption?.trim() || null
      if (caption && captionError(caption)) return { ok: false, error: captionError(caption)! }

      const ticket = await callFillMedia<{ media_id: string; path: string; token: string }>(
        fillToken,
        'media_upload_url',
        { mime_type: input.mimeType, byte_size: input.blob.size },
      )
      if (!ticket.ok) return { ok: false, error: fillMediaErrorMessage(ticket.code, input.mimeType) }

      const { error: uploadError } = await supabaseAnon.storage
        .from('event-media')
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, input.blob, {
          contentType: input.mimeType,
        })
      if (uploadError) return { ok: false, error: EVENT_MEDIA_NETWORK }

      const created = await callFillMedia<{ media: EventMedia; pending_digits?: string[] }>(
        fillToken,
        'media_create',
        {
          media_id: ticket.data.media_id,
          mime_type: input.mimeType,
          width: input.width,
          height: input.height,
          taken_when: input.takenWhen,
          caption,
          subject: input.subject,
        },
      )
      if (!created.ok) {
        return { ok: false, error: fillMediaErrorMessage(created.code, input.mimeType) }
      }
      return {
        ok: true,
        media: created.data.media,
        pendingDigits: created.data.pending_digits ?? [],
      }
    },

    async setSubject(input) {
      const payload: Record<string, unknown> = { media_id: input.mediaId, subject: input.subject }
      if (input.takenWhen) payload.taken_when = input.takenWhen
      if (input.caption !== undefined) {
        const caption = input.caption?.trim() || null
        if (caption && captionError(caption)) return { ok: false, error: captionError(caption)! }
        payload.caption = caption
      }
      const result = await callFillMedia<{ ids?: string[]; pending_digits?: string[] }>(
        fillToken,
        'media_update',
        payload,
      )
      if (!result.ok) return { ok: false, error: fillMediaErrorMessage(result.code) }
      return { ok: true, ids: result.data.ids ?? [], pendingDigits: result.data.pending_digits ?? [] }
    },

    async remove(item) {
      const result = await callFillMedia(fillToken, 'media_delete', { media_id: item.id })
      return result.ok ? { ok: true } : { ok: false, error: fillMediaErrorMessage(result.code) }
    },

    async linkPending(_eventId, links) {
      if (links.length === 0) return []
      const result = await callFillMedia<{ waiting?: PendingMediaLink[] }>(
        fillToken,
        'media_link_pending',
        { links },
      )
      return result.ok ? (result.data.waiting ?? []) : [...links]
    },

    async coverage() {
      const result = await callFillMedia<{ covered?: string[] }>(fillToken, 'media_coverage')
      if (!result.ok || !Array.isArray(result.data.covered)) return null
      return new Set(result.data.covered)
    },
  }
}
