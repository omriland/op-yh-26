import type { AppRole } from './auth'
import { isImpersonating } from './impersonationStash'
import type { StampDescriptor } from './status'
import { supabase } from './supabase'

export type FeedbackKind = 'bug' | 'suggestion'
export type FeedbackStatus = 'open' | 'fixed' | 'wont_do'

export const FEEDBACK_BODY_MAX = 2000
export const FEEDBACK_AUDIO_MAX_BYTES = 5 * 1024 * 1024
export const FEEDBACK_RECORD_MAX_SECONDS = 90
export const FEEDBACK_BUCKET = 'user-feedback'

export const FEEDBACK_NETWORK = 'השליחה נכשלה. בדקו את החיבור ונסו שוב.'
export const FEEDBACK_EMPTY_ERROR = 'יש לכתוב הערה או להקליט הודעה.'
export const FEEDBACK_BODY_ERROR = 'ההערה ארוכה מדי. קצרו ל־2,000 תווים.'
export const FEEDBACK_KIND_ERROR = 'בחרו אם זה באג או הצעה.'
export const FEEDBACK_AUDIO_SIZE_ERROR = 'ההקלטה ארוכה מדי. הקליטו שוב בקצרה.'
export const FEEDBACK_MIC_ERROR = 'אין גישה למיקרופון. אפשר לכתוב הערה במקום.'
export const FEEDBACK_RECORD_UNSUPPORTED = 'ההקלטה אינה זמינה בדפדפן זה. אפשר לכתוב הערה.'

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: 'באג',
  suggestion: 'הצעה',
}

/** Quoted feedback body in the treated SMS. Keep in sync with `supabase/functions/_shared/feedbackTreatedSms.ts`. */
export const FEEDBACK_SMS_EXCERPT_MAX = 80
export const FEEDBACK_SMS_AUDIO_EXCERPT = 'ההקלטה'
export const FEEDBACK_SMS_FALLBACK_EXCERPT = 'המשוב'

export type FeedbackSmsResult =
  | 'sent'
  | 'skipped_no_phone'
  | 'failed'
  | 'skipped'
  | 'unavailable'

export function firstNameFromFullName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

export function feedbackSmsExcerpt(
  body: string | null | undefined,
  hasAudio: boolean,
): string {
  const compact = (body ?? '').replace(/\s+/g, ' ').trim()
  if (!compact) return hasAudio ? FEEDBACK_SMS_AUDIO_EXCERPT : FEEDBACK_SMS_FALLBACK_EXCERPT
  if (compact.length <= FEEDBACK_SMS_EXCERPT_MAX) return compact
  return `${compact.slice(0, FEEDBACK_SMS_EXCERPT_MAX - 1)}…`
}

export function buildFeedbackTreatedSms(input: {
  fullName: string | null | undefined
  body: string | null | undefined
  hasAudio: boolean
}): string {
  const first = firstNameFromFullName(input.fullName)
  const greeting = first ? `היי, ${first},` : 'היי,'
  const excerpt = feedbackSmsExcerpt(input.body, input.hasAudio)
  return `${greeting}\nרק רצינו לעדכן שהפידבק שנתת על ${excerpt} טופל\n"אבן דרך"`
}

export function feedbackTreatedToast(sms?: FeedbackSmsResult): {
  message: string
  tone: 'done' | 'alert'
} {
  if (sms === 'skipped_no_phone') {
    return { message: 'הסטטוס עודכן. לא נשלח SMS — אין מספר נייד תקין.', tone: 'alert' }
  }
  if (sms === 'failed' || sms === 'unavailable') {
    return { message: 'הסטטוס עודכן. שליחת ה-SMS נכשלה.', tone: 'alert' }
  }
  return { message: 'הסטטוס עודכן.', tone: 'done' }
}

export const FEEDBACK_STATUS_STAMP: Record<FeedbackStatus, StampDescriptor> = {
  open: { label: 'פתוח', tone: 'pending' },
  fixed: { label: 'טופל', tone: 'done' },
  wont_do: { label: 'לא יטופל', tone: 'draft' },
}

export type UserFeedback = {
  id: string
  user_id: string
  author_name: string | null
  author_callsign: string | null
  kind: FeedbackKind
  body: string | null
  page_path: string | null
  status: FeedbackStatus
  audio_storage_path: string | null
  audio_mime_type: string | null
  audio_byte_size: number | null
  created_at: string
  signed_url: string | null
}

type FeedbackRow = {
  id: string
  user_id: string
  kind: FeedbackKind
  body: string | null
  page_path: string | null
  status: FeedbackStatus
  audio_storage_path: string | null
  audio_mime_type: string | null
  audio_byte_size: number | null
  created_at: string
  author?:
    | { full_name: string | null; callsign: string | null }
    | { full_name: string | null; callsign: string | null }[]
    | null
}

const FEEDBACK_SELECT =
  'id, user_id, kind, body, page_path, status, audio_storage_path, audio_mime_type, audio_byte_size, created_at, author:profiles!user_feedback_user_id_fkey(full_name, callsign)'

export function canManageFeedbackInbox(roles: readonly AppRole[]): boolean {
  return roles.includes('super_admin')
}

export function feedbackBodyError(body: string): string | undefined {
  if (body.length > FEEDBACK_BODY_MAX) return FEEDBACK_BODY_ERROR
  return undefined
}

export function feedbackSubmitError(input: {
  kind: FeedbackKind | null
  body: string
  hasAudio: boolean
}): string | undefined {
  if (!input.kind) return FEEDBACK_KIND_ERROR
  const trimmed = input.body.trim()
  const bodyErr = feedbackBodyError(trimmed)
  if (bodyErr) return bodyErr
  if (!trimmed && !input.hasAudio) return FEEDBACK_EMPTY_ERROR
  return undefined
}

export function feedbackStorageExt(mime: string): 'webm' | 'm4a' | 'mp4' | 'ogg' | 'mp3' {
  const lower = mime.toLowerCase()
  if (lower.includes('webm')) return 'webm'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a'
  return 'webm'
}

export function normalizeFeedbackAudioMime(mime: string): string {
  const lower = mime.toLowerCase()
  if (lower.includes('webm')) return 'audio/webm'
  if (lower.includes('ogg')) return 'audio/ogg'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'audio/mpeg'
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'audio/mp4'
  return 'audio/webm'
}

export function feedbackStoragePath(userId: string, feedbackId: string, mime: string): string {
  return `${userId}/${feedbackId}.${feedbackStorageExt(mime)}`
}

export function formatRecordSeconds(total: number): string {
  const safe = Math.max(0, Math.min(FEEDBACK_RECORD_MAX_SECONDS, Math.floor(total)))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function authorFromRow(row: FeedbackRow): { name: string | null; callsign: string | null } {
  const author = row.author
  if (!author) return { name: null, callsign: null }
  const one = Array.isArray(author) ? author[0] : author
  return { name: one?.full_name ?? null, callsign: one?.callsign ?? null }
}

async function withSignedUrl(row: FeedbackRow): Promise<UserFeedback> {
  const author = authorFromRow(row)
  let signed_url: string | null = null
  if (row.audio_storage_path) {
    const { data } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrl(row.audio_storage_path, 3600)
    signed_url = data?.signedUrl ?? null
  }
  return {
    id: row.id,
    user_id: row.user_id,
    author_name: author.name,
    author_callsign: author.callsign,
    kind: row.kind,
    body: row.body,
    page_path: row.page_path,
    status: row.status,
    audio_storage_path: row.audio_storage_path,
    audio_mime_type: row.audio_mime_type,
    audio_byte_size: row.audio_byte_size,
    created_at: row.created_at,
    signed_url,
  }
}

export async function submitUserFeedback(input: {
  kind: FeedbackKind
  body: string
  pagePath: string | null
  audio: Blob | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const error = feedbackSubmitError({
    kind: input.kind,
    body: input.body,
    hasAudio: Boolean(input.audio && input.audio.size > 0),
  })
  if (error) return { ok: false, error }

  if (input.audio && input.audio.size > FEEDBACK_AUDIO_MAX_BYTES) {
    return { ok: false, error: FEEDBACK_AUDIO_SIZE_ERROR }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: FEEDBACK_NETWORK }

  const id = crypto.randomUUID()
  const body = input.body.trim() || null
  const page_path = input.pagePath?.trim().slice(0, 200) || null
  let audio_storage_path: string | null = null
  let audio_mime_type: string | null = null
  let audio_byte_size: number | null = null

  if (input.audio && input.audio.size > 0) {
    audio_mime_type = normalizeFeedbackAudioMime(input.audio.type || 'audio/webm')
    audio_storage_path = feedbackStoragePath(user.id, id, audio_mime_type)
    audio_byte_size = input.audio.size
    const { error: uploadError } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .upload(audio_storage_path, input.audio, {
        contentType: audio_mime_type,
        upsert: false,
      })
    if (uploadError) return { ok: false, error: FEEDBACK_NETWORK }
  }

  const { error: insertError } = await supabase.from('user_feedback').insert({
    id,
    user_id: user.id,
    kind: input.kind,
    body,
    page_path,
    status: 'open',
    audio_storage_path,
    audio_mime_type,
    audio_byte_size,
  })

  if (insertError) {
    if (audio_storage_path) {
      await supabase.storage.from(FEEDBACK_BUCKET).remove([audio_storage_path])
    }
    return { ok: false, error: FEEDBACK_NETWORK }
  }

  return { ok: true }
}

export async function listUserFeedback(status?: FeedbackStatus | 'all'): Promise<UserFeedback[]> {
  let query = supabase
    .from('user_feedback')
    .select(FEEDBACK_SELECT)
    .order('created_at', { ascending: false })
  if (status && status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Promise.all(((data ?? []) as FeedbackRow[]).map(withSignedUrl))
}

export async function hasOpenUserFeedback(): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function updateFeedbackStatusRow(
  id: string,
  status: FeedbackStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('user_feedback').update({ status }).eq('id', id)
  if (error) return { ok: false, error: FEEDBACK_NETWORK }
  return { ok: true }
}

async function markFeedbackTreatedViaEdge(
  id: string,
): Promise<{ ok: true; sms: FeedbackSmsResult } | { ok: false; error: string }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (sessionError || !token) {
    return { ok: false, error: 'יש להתחבר מחדש.' }
  }

  const { data, error } = await supabase.functions.invoke('user-feedback', {
    body: { action: 'mark_treated', id },
  })

  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload.error) return { ok: false, error: payload.error }
      } catch {
        /* gateway 404 has no JSON body */
      }
      if (ctx.status === 404) {
        const fallback = await updateFeedbackStatusRow(id, 'fixed')
        if (!fallback.ok) return fallback
        return { ok: true, sms: 'unavailable' }
      }
    }
    if (/not found/i.test(error.message ?? '')) {
      const fallback = await updateFeedbackStatusRow(id, 'fixed')
      if (!fallback.ok) return fallback
      return { ok: true, sms: 'unavailable' }
    }
    return { ok: false, error: FEEDBACK_NETWORK }
  }

  const payload = data as { error?: string; sms?: FeedbackSmsResult }
  if (payload?.error) return { ok: false, error: payload.error }
  return { ok: true, sms: payload.sms ?? 'sent' }
}

export async function updateUserFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<{ ok: true; sms?: FeedbackSmsResult } | { ok: false; error: string }> {
  if (status === 'fixed') {
    if (isImpersonating()) {
      const result = await updateFeedbackStatusRow(id, status)
      if (!result.ok) return result
      return { ok: true, sms: 'skipped' }
    }
    return markFeedbackTreatedViaEdge(id)
  }

  const result = await updateFeedbackStatusRow(id, status)
  if (!result.ok) return result
  return { ok: true }
}

export async function deleteUserFeedback(input: {
  id: string
  audioStoragePath: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('user_feedback').delete().eq('id', input.id)
  if (error) return { ok: false, error: FEEDBACK_NETWORK }
  if (input.audioStoragePath) {
    await supabase.storage.from(FEEDBACK_BUCKET).remove([input.audioStoragePath])
  }
  return { ok: true }
}
