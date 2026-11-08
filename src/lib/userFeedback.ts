import {
  feedbackIdsNeedingTranscript,
  transcriptionFailureMessage,
  type TranscriptCandidate,
} from '../../supabase/functions/_shared/feedbackTranscript.ts'
import type { AppRole } from './auth'
import { isImpersonating } from './impersonationStash'
import type { StampDescriptor } from './status'
import { supabase } from './supabase'

export type FeedbackKind = 'bug' | 'suggestion'
export type FeedbackStatus = 'open' | 'in_progress' | 'fixed' | 'wont_do'

export const FEEDBACK_BODY_MAX = 2000
export const FEEDBACK_AUDIO_MAX_BYTES = 5 * 1024 * 1024
export const FEEDBACK_RECORD_MAX_SECONDS = 90
export const FEEDBACK_BUCKET = 'user-feedback'
export const FEEDBACK_ATTACH_MAX = 3
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const FEEDBACK_VIDEO_MAX_BYTES = 25 * 1024 * 1024
export const FEEDBACK_ATTACH_NAME_MAX = 200

export const FEEDBACK_NETWORK = 'השליחה נכשלה. בדקו את החיבור ונסו שוב.'
export const FEEDBACK_UPDATE_ERROR = 'העדכון נכשל. נסו שוב.'
export const FEEDBACK_DELETE_ERROR = 'המחיקה נכשלה. נסו שוב.'
export const FEEDBACK_TASK_SAVE_ERROR = 'שמירת המשימה נכשלה. נסו שוב.'
export const FEEDBACK_EMPTY_ERROR = 'יש לכתוב הערה או להקליט הודעה.'
export const FEEDBACK_BODY_ERROR = 'ההערה ארוכה מדי. קצרו ל־2,000 תווים.'
export const FEEDBACK_KIND_ERROR = 'בחרו אם זה באג או הצעה.'
export const FEEDBACK_AUDIO_SIZE_ERROR = 'ההקלטה ארוכה מדי. הקליטו שוב בקצרה.'
export const FEEDBACK_MIC_ERROR = 'אין גישה למיקרופון. אפשר לכתוב הערה במקום.'
export const FEEDBACK_RECORD_UNSUPPORTED = 'ההקלטה אינה זמינה בדפדפן זה. אפשר לכתוב הערה.'
export const FEEDBACK_ATTACH_HINT =
  'אפשר לצרף עד 3 קבצים: צילומי מסך עד 5 מ״ב, או סרטונים קצרים עד 25 מ״ב.'
export const FEEDBACK_ATTACH_COUNT_ERROR = 'אפשר לצרף עד 3 קבצים.'
export const FEEDBACK_ATTACH_TYPE_ERROR = 'אפשר לצרף רק צילומי מסך או סרטונים קצרים.'
export const FEEDBACK_ATTACH_IMAGE_SIZE_ERROR = 'התמונה גדולה מדי. בחרו קובץ עד 5 מ״ב.'
export const FEEDBACK_ATTACH_VIDEO_SIZE_ERROR = 'הסרטון גדול מדי. בחרו קובץ עד 25 מ״ב.'
export const FEEDBACK_ATTACH_UNAVAILABLE =
  'צירוף הקבצים אינו זמין כרגע. שלחו בלי קבצים, או נסו שוב מאוחר יותר.'

export const FEEDBACK_TASK_TITLE_MAX = 120
export const FEEDBACK_TASK_TITLE_ERROR = 'יש לכתוב כותרת.'
export const FEEDBACK_TASK_TITLE_LEN_ERROR = 'הכותרת ארוכה מדי. קצרו ל־120 תווים.'

/** Assignee filter values besides a profile id. */
export const FEEDBACK_ASSIGNEE_ALL = 'all'
export const FEEDBACK_ASSIGNEE_NONE = 'none'

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
  | 'already_sent'
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
  if (sms === 'already_sent') {
    return { message: 'הסטטוס עודכן. השולח כבר קיבל SMS על המשוב הזה, ולא נשלח שוב.', tone: 'done' }
  }
  return { message: 'הסטטוס עודכן.', tone: 'done' }
}

export const FEEDBACK_STATUS_STAMP: Record<FeedbackStatus, StampDescriptor> = {
  open: { label: 'פתוח', tone: 'pending' },
  in_progress: { label: 'בטיפול', tone: 'partial' },
  fixed: { label: 'טופל', tone: 'done' },
  wont_do: { label: 'לא יטופל', tone: 'draft' },
}

export type FeedbackAttachmentKind = 'image' | 'video'

export type FeedbackAttachmentMeta = {
  path: string
  mime: string
  size: number
  name: string
}

export type FeedbackAttachmentView = FeedbackAttachmentMeta & {
  kind: FeedbackAttachmentKind
  signed_url: string | null
}

export type FeedbackPickedFile = {
  name: string
  type: string
  size: number
}

export type UserFeedback = {
  id: string
  user_id: string
  author_name: string | null
  author_callsign: string | null
  /** Null on a task a super admin opened from the inbox. */
  kind: FeedbackKind | null
  title: string | null
  assignee_id: string | null
  body: string | null
  page_path: string | null
  status: FeedbackStatus
  audio_storage_path: string | null
  audio_mime_type: string | null
  audio_byte_size: number | null
  transcript: string | null
  transcribed_at: string | null
  attachments: FeedbackAttachmentView[]
  created_at: string
  updated_at: string
  signed_url: string | null
  /** Place in its board column; null until a manager moves the card. */
  board_position: number | null
  /** Internal note, managers only. */
  board_note: string | null
  /** When the submitter was texted that this was treated. At most once, ever. */
  sms_sent_at: string | null
  /** True when the text predates the record (treated before the board existed). */
  sms_sent_inferred: boolean
}

type FeedbackRow = {
  id: string
  user_id: string
  kind: FeedbackKind | null
  title?: string | null
  assignee_id?: string | null
  body: string | null
  page_path: string | null
  status: FeedbackStatus
  audio_storage_path: string | null
  audio_mime_type: string | null
  audio_byte_size: number | null
  transcript?: string | null
  transcribed_at?: string | null
  attachments?: unknown
  created_at: string
  updated_at?: string
  board?: FeedbackBoardRow | FeedbackBoardRow[] | null
  author?:
    | { full_name: string | null; callsign: string | null }
    | { full_name: string | null; callsign: string | null }[]
    | null
}

const FEEDBACK_SELECT_BASE =
  'id, user_id, kind, body, page_path, status, audio_storage_path, audio_mime_type, audio_byte_size'

type FeedbackBoardRow = {
  position: number | null
  note: string | null
  sms_sent_at?: string | null
  sms_sent_inferred?: boolean | null
}

const FEEDBACK_SELECT_AUTHOR =
  'created_at, updated_at, author:profiles!user_feedback_user_id_fkey(full_name, callsign)'

/** Columns later migrations added; each is dropped when the database does not have it yet. */
export type FeedbackColumnGroup = 'task' | 'transcript' | 'attachments' | 'board'

const FEEDBACK_COLUMN_GROUPS: Record<FeedbackColumnGroup, string> = {
  task: 'title, assignee_id',
  transcript: 'transcript, transcribed_at',
  attachments: 'attachments',
  board: 'board:user_feedback_board(position, note, sms_sent_at, sms_sent_inferred)',
}

export const FEEDBACK_ALL_COLUMN_GROUPS: readonly FeedbackColumnGroup[] = [
  'task',
  'transcript',
  'attachments',
  'board',
]

export function feedbackSelect(groups: readonly FeedbackColumnGroup[]): string {
  const optional = groups.map((group) => FEEDBACK_COLUMN_GROUPS[group])
  return [FEEDBACK_SELECT_BASE, ...optional, FEEDBACK_SELECT_AUTHOR].join(', ')
}

export function missingFeedbackColumnGroup(
  error: { code?: string; message?: string } | null | undefined,
): FeedbackColumnGroup | null {
  if (isMissingFeedbackTaskColumns(error)) return 'task'
  if (isMissingFeedbackTranscriptColumn(error)) return 'transcript'
  if (isMissingFeedbackAttachmentsColumn(error)) return 'attachments'
  if (isMissingFeedbackBoardTable(error)) return 'board'
  return null
}

const FEEDBACK_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

const FEEDBACK_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
])

const FEEDBACK_EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
}

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

export function feedbackTaskError(input: { title: string; body: string }): string | undefined {
  const title = input.title.trim()
  if (!title) return FEEDBACK_TASK_TITLE_ERROR
  if (title.length > FEEDBACK_TASK_TITLE_MAX) return FEEDBACK_TASK_TITLE_LEN_ERROR
  return feedbackBodyError(input.body.trim())
}

export function isFeedbackTask(item: Pick<UserFeedback, 'title'>): boolean {
  return Boolean(item.title)
}

export function feedbackHeading(item: Pick<UserFeedback, 'title' | 'kind'>): string {
  if (item.title) return item.title
  return item.kind ? FEEDBACK_KIND_LABEL[item.kind] : 'משוב'
}

/** `all`, `none` (unassigned) or an assignee profile id. */
export function filterFeedbackByAssignee<T extends Pick<UserFeedback, 'assignee_id'>>(
  items: readonly T[],
  filter: string,
): T[] {
  if (filter === FEEDBACK_ASSIGNEE_ALL) return [...items]
  if (filter === FEEDBACK_ASSIGNEE_NONE) return items.filter((item) => !item.assignee_id)
  return items.filter((item) => item.assignee_id === filter)
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

export function isMissingFeedbackAttachmentsColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    (error.code === '42703' && /user_feedback\.attachments/.test(message)) ||
    (error.code === 'PGRST204' && /attachments/.test(message))
  )
}

export function isMissingFeedbackTranscriptColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    (error.code === '42703' && /user_feedback\.transcript/.test(message)) ||
    (error.code === 'PGRST204' && /transcript/.test(message))
  )
}

export function isMissingFeedbackTaskColumns(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    (error.code === '42703' && /user_feedback\.(title|assignee_id)/.test(message)) ||
    (error.code === 'PGRST204' && /title|assignee_id/.test(message))
  )
}

/** Before 20261107120000 there is no user_feedback_board to embed or write. */
export function isMissingFeedbackBoardTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    ((error.code === 'PGRST200' || error.code === 'PGRST205' || error.code === '42P01') &&
      /user_feedback_board/.test(message))
  )
}

export function parseFeedbackAttachments(raw: unknown): FeedbackAttachmentMeta[] {
  if (!Array.isArray(raw)) return []
  const out: FeedbackAttachmentMeta[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const path = typeof rec.path === 'string' ? rec.path : ''
    const mime = typeof rec.mime === 'string' ? rec.mime : ''
    const name = typeof rec.name === 'string' ? rec.name : ''
    const size = typeof rec.size === 'number' ? rec.size : Number(rec.size)
    if (!path || !mime || !name || !Number.isFinite(size)) continue
    out.push({ path, mime, name, size })
  }
  return out.slice(0, FEEDBACK_ATTACH_MAX)
}

export function normalizeFeedbackAttachmentMime(mime: string, name: string): string | null {
  const fromMime = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (fromMime === 'image/jpg') return 'image/jpeg'
  if (FEEDBACK_IMAGE_MIMES.has(fromMime) || FEEDBACK_VIDEO_MIMES.has(fromMime)) return fromMime
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FEEDBACK_EXT_MIME[ext] ?? null
}

export function feedbackAttachmentKind(
  mime: string,
  name = '',
): FeedbackAttachmentKind | null {
  const normalized = normalizeFeedbackAttachmentMime(mime, name)
  if (!normalized) return null
  return normalized.startsWith('image/') ? 'image' : 'video'
}

export function feedbackAttachmentExt(mime: string, name = ''): string | null {
  const normalized = normalizeFeedbackAttachmentMime(mime, name)
  if (!normalized) return null
  switch (normalized) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/heic':
      return 'heic'
    case 'image/heif':
      return 'heif'
    case 'video/mp4':
      return 'mp4'
    case 'video/webm':
      return 'webm'
    case 'video/quicktime':
      return 'mov'
    case 'video/3gpp':
      return '3gp'
    default:
      return null
  }
}

export function feedbackAttachmentStoragePath(
  userId: string,
  feedbackId: string,
  attachmentId: string,
  mime: string,
  name = '',
): string | null {
  const ext = feedbackAttachmentExt(mime, name)
  if (!ext) return null
  return `${userId}/${feedbackId}/${attachmentId}.${ext}`
}

export function feedbackAttachmentError(file: FeedbackPickedFile): string | undefined {
  const kind = feedbackAttachmentKind(file.type, file.name)
  if (!kind) return FEEDBACK_ATTACH_TYPE_ERROR
  if (kind === 'image' && file.size > FEEDBACK_IMAGE_MAX_BYTES) {
    return FEEDBACK_ATTACH_IMAGE_SIZE_ERROR
  }
  if (kind === 'video' && file.size > FEEDBACK_VIDEO_MAX_BYTES) {
    return FEEDBACK_ATTACH_VIDEO_SIZE_ERROR
  }
  if (file.size <= 0) return FEEDBACK_ATTACH_TYPE_ERROR
  return undefined
}

export function addFeedbackAttachments<T extends FeedbackPickedFile>(
  current: readonly T[],
  incoming: readonly T[],
): { files: T[]; error?: string } {
  const next = [...current]
  let error: string | undefined
  for (const file of incoming) {
    if (next.length >= FEEDBACK_ATTACH_MAX) {
      error = FEEDBACK_ATTACH_COUNT_ERROR
      break
    }
    const fileError = feedbackAttachmentError(file)
    if (fileError) {
      error = fileError
      continue
    }
    next.push(file)
  }
  return { files: next, error }
}

export function sanitizeFeedbackAttachmentName(name: string): string {
  const trimmed = name.trim().replace(/[/\\]/g, '') || 'קובץ'
  return trimmed.slice(0, FEEDBACK_ATTACH_NAME_MAX)
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
  const board = Array.isArray(row.board) ? row.board[0] : row.board
  let signed_url: string | null = null
  if (row.audio_storage_path) {
    const { data } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrl(row.audio_storage_path, 3600)
    signed_url = data?.signedUrl ?? null
  }
  const metas = parseFeedbackAttachments(row.attachments)
  const signedByPath = new Map<string, string>()
  if (metas.length > 0) {
    const { data } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrls(
        metas.map((item) => item.path),
        3600,
      )
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
    }
  }
  const attachments: FeedbackAttachmentView[] = metas.map((item) => ({
    ...item,
    kind: feedbackAttachmentKind(item.mime, item.name) ?? 'image',
    signed_url: signedByPath.get(item.path) ?? null,
  }))
  return {
    id: row.id,
    user_id: row.user_id,
    author_name: author.name,
    author_callsign: author.callsign,
    kind: row.kind,
    title: row.title ?? null,
    assignee_id: row.assignee_id ?? null,
    body: row.body,
    page_path: row.page_path,
    status: row.status,
    audio_storage_path: row.audio_storage_path,
    audio_mime_type: row.audio_mime_type,
    audio_byte_size: row.audio_byte_size,
    transcript: row.transcript ?? null,
    transcribed_at: row.transcribed_at ?? null,
    attachments,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    signed_url,
    board_position: board?.position ?? null,
    board_note: board?.note ?? null,
    sms_sent_at: board?.sms_sent_at ?? null,
    sms_sent_inferred: board?.sms_sent_inferred === true,
  }
}

export async function submitUserFeedback(input: {
  kind: FeedbackKind
  body: string
  pagePath: string | null
  audio: Blob | null
  files?: File[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const files = input.files ?? []
  const error = feedbackSubmitError({
    kind: input.kind,
    body: input.body,
    hasAudio: Boolean(input.audio && input.audio.size > 0),
  })
  if (error) return { ok: false, error }

  if (input.audio && input.audio.size > FEEDBACK_AUDIO_MAX_BYTES) {
    return { ok: false, error: FEEDBACK_AUDIO_SIZE_ERROR }
  }

  const added = addFeedbackAttachments([], files)
  if (added.error) return { ok: false, error: added.error }

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
  const uploadedPaths: string[] = []
  const attachments: FeedbackAttachmentMeta[] = []

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
    uploadedPaths.push(audio_storage_path)
  }

  for (const file of added.files) {
    const mime = normalizeFeedbackAttachmentMime(file.type, file.name)
    const attachmentId = crypto.randomUUID()
    const storagePath =
      mime && feedbackAttachmentStoragePath(user.id, id, attachmentId, mime, file.name)
    if (!mime || !storagePath) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(FEEDBACK_BUCKET).remove(uploadedPaths)
      }
      return { ok: false, error: FEEDBACK_ATTACH_TYPE_ERROR }
    }
    const { error: uploadError } = await supabase.storage.from(FEEDBACK_BUCKET).upload(storagePath, file, {
      contentType: mime,
      upsert: false,
    })
    if (uploadError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(FEEDBACK_BUCKET).remove(uploadedPaths)
      }
      return { ok: false, error: FEEDBACK_NETWORK }
    }
    uploadedPaths.push(storagePath)
    attachments.push({
      path: storagePath,
      mime,
      size: file.size,
      name: sanitizeFeedbackAttachmentName(file.name),
    })
  }

  const row: Record<string, unknown> = {
    id,
    user_id: user.id,
    kind: input.kind,
    body,
    page_path,
    status: 'open',
    audio_storage_path,
    audio_mime_type,
    audio_byte_size,
  }
  if (attachments.length > 0) row.attachments = attachments

  const { error: insertError } = await supabase.from('user_feedback').insert(row)

  if (insertError) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(FEEDBACK_BUCKET).remove(uploadedPaths)
    }
    if (attachments.length > 0 && isMissingFeedbackAttachmentsColumn(insertError)) {
      return { ok: false, error: FEEDBACK_ATTACH_UNAVAILABLE }
    }
    return { ok: false, error: FEEDBACK_NETWORK }
  }

  return { ok: true }
}

/** `active` is the default board view: open and in progress together. */
export type FeedbackListFilter = FeedbackStatus | 'all' | 'active'

export const FEEDBACK_ACTIVE_STATUSES: readonly FeedbackStatus[] = ['open', 'in_progress']

export function feedbackMatchesFilter(status: FeedbackStatus, filter: FeedbackListFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return FEEDBACK_ACTIVE_STATUSES.includes(status)
  return status === filter
}

/** In progress first, then newest first. */
export function sortFeedbackForBoard<T extends Pick<UserFeedback, 'status' | 'created_at'>>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const rank = Number(b.status === 'in_progress') - Number(a.status === 'in_progress')
    return rank || b.created_at.localeCompare(a.created_at)
  })
}

export async function listUserFeedback(filter: FeedbackListFilter = 'all'): Promise<UserFeedback[]> {
  // Without the task-board migration the status type has no in_progress (22P02).
  let statuses: FeedbackStatus[] | null =
    filter === 'all' ? null : filter === 'active' ? [...FEEDBACK_ACTIVE_STATUSES] : [filter]
  const run = async (select: string) => {
    let query = supabase
      .from('user_feedback')
      .select(select)
      .order('created_at', { ascending: false })
    if (statuses) query = query.in('status', statuses)
    return query
  }
  let groups = [...FEEDBACK_ALL_COLUMN_GROUPS]
  let { data, error } = await run(feedbackSelect(groups))
  // Postgres reports a missing column before a bad status, so either can surface after the other is fixed.
  while (error) {
    const missing = missingFeedbackColumnGroup(error)
    if (missing && groups.includes(missing)) {
      groups = groups.filter((group) => group !== missing)
    } else if (error.code === '22P02' && filter === 'active' && statuses?.length !== 1) {
      statuses = ['open']
    } else {
      break
    }
    ;({ data, error } = await run(feedbackSelect(groups)))
  }
  if (error) throw new Error(error.message)
  const rows = await Promise.all(((data ?? []) as unknown as FeedbackRow[]).map(withSignedUrl))
  return sortFeedbackForBoard(rows)
}

/**
 * Nav dot: something open or in progress that is the viewer's or nobody's.
 * A task the viewer opened and gave to someone else does not count.
 */
export async function hasOpenUserFeedback(viewerId: string): Promise<boolean> {
  const base = () =>
    supabase.from('user_feedback').select('id', { count: 'exact', head: true })
  let { count, error } = await base()
    .in('status', [...FEEDBACK_ACTIVE_STATUSES])
    .or(`assignee_id.is.null,assignee_id.eq.${viewerId}`)
  if (error && (isMissingFeedbackTaskColumns(error) || error.code === '22P02')) {
    ;({ count, error } = await base().eq('status', 'open'))
  }
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function updateFeedbackStatusRow(
  id: string,
  status: FeedbackStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('user_feedback').update({ status }).eq('id', id)
  if (error) return { ok: false, error: FEEDBACK_UPDATE_ERROR }
  return { ok: true }
}

/** `smsSentAt` is when the submitter was texted, now or earlier; absent when they were not. */
export type FeedbackStatusResult =
  | { ok: true; sms?: FeedbackSmsResult; smsSentAt?: string | null; smsSentInferred?: boolean }
  | { ok: false; error: string }

async function markFeedbackTreatedViaEdge(id: string): Promise<FeedbackStatusResult> {
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
    return { ok: false, error: FEEDBACK_UPDATE_ERROR }
  }

  const payload = data as {
    error?: string
    sms?: FeedbackSmsResult
    sms_sent_at?: string | null
    sms_sent_inferred?: boolean
  }
  if (payload?.error) return { ok: false, error: payload.error }
  return {
    ok: true,
    sms: payload.sms ?? 'sent',
    smsSentAt: payload.sms_sent_at ?? null,
    smsSentInferred: payload.sms_sent_inferred === true,
  }
}

const transcriptInflight = new Map<string, Promise<{ ok: true; transcript: string } | { ok: false; error: string }>>()

export function feedbackRowsNeedingTranscript(
  rows: readonly Pick<UserFeedback, 'id' | 'audio_storage_path' | 'transcript'>[],
): string[] {
  const candidates: TranscriptCandidate[] = rows.map((row) => ({
    id: row.id,
    audioStoragePath: row.audio_storage_path,
    transcript: row.transcript,
  }))
  return feedbackIdsNeedingTranscript(candidates)
}

async function requestFeedbackTranscript(
  id: string,
): Promise<{ ok: true; transcript: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('transcribe-feedback', {
    body: { id },
  })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload.error) return { ok: false, error: payload.error }
      } catch {
        /* gateway body is not JSON */
      }
      return { ok: false, error: transcriptionFailureMessage(ctx.status) }
    }
    return { ok: false, error: transcriptionFailureMessage(null) }
  }
  const payload = data as { error?: string; transcript?: string }
  if (payload?.error) return { ok: false, error: payload.error }
  const transcript = typeof payload?.transcript === 'string' ? payload.transcript.trim() : ''
  if (!transcript) return { ok: false, error: transcriptionFailureMessage(null) }
  return { ok: true, transcript }
}

/** One in-flight request per id. A later load retries only after this settles. */
export function transcribeUserFeedback(
  id: string,
): Promise<{ ok: true; transcript: string } | { ok: false; error: string }> {
  const existing = transcriptInflight.get(id)
  if (existing) return existing
  const pending = requestFeedbackTranscript(id).finally(() => {
    transcriptInflight.delete(id)
  })
  transcriptInflight.set(id, pending)
  return pending
}

export async function updateUserFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  options: { notifyAuthor?: boolean } = {},
): Promise<FeedbackStatusResult> {
  if (status === 'fixed' && options.notifyAuthor !== false) {
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
  attachmentPaths?: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('user_feedback').delete().eq('id', input.id)
  if (error) return { ok: false, error: FEEDBACK_DELETE_ERROR }
  const paths = [
    input.audioStoragePath,
    ...(input.attachmentPaths ?? []),
  ].filter((path): path is string => Boolean(path))
  if (paths.length > 0) {
    await supabase.storage.from(FEEDBACK_BUCKET).remove(paths)
  }
  return { ok: true }
}

/** `assignable` is false for someone still holding rows who is no longer an active super admin. */
export type FeedbackAssignee = { id: string; full_name: string; assignable: boolean }

export type FeedbackAssigneeOption = { value: string; label: string }

function assigneeLabel(person: FeedbackAssignee): string {
  return person.assignable ? person.full_name : `${person.full_name} (לא פעיל)`
}

/** Choices for one row: the assignable people, plus the stored assignee if they no longer qualify. */
export function feedbackAssigneeOptions(
  assignees: readonly FeedbackAssignee[],
  currentId: string | null,
): FeedbackAssigneeOption[] {
  const options = [
    { value: FEEDBACK_ASSIGNEE_NONE, label: 'לא משויך' },
    ...assignees
      .filter((person) => person.assignable)
      .map((person) => ({ value: person.id, label: person.full_name })),
  ]
  if (currentId && !options.some((option) => option.value === currentId)) {
    const stored = assignees.find((person) => person.id === currentId)
    options.push({
      value: currentId,
      label: stored ? assigneeLabel(stored) : 'משתמש (לא פעיל)',
    })
  }
  return options
}

export function feedbackAssigneeFilterOptions(
  assignees: readonly FeedbackAssignee[],
): FeedbackAssigneeOption[] {
  return [
    { value: FEEDBACK_ASSIGNEE_ALL, label: 'כל האחראים' },
    { value: FEEDBACK_ASSIGNEE_NONE, label: 'לא משויך' },
    ...assignees.map((person) => ({ value: person.id, label: assigneeLabel(person) })),
  ]
}

export async function listFeedbackAssignees(): Promise<FeedbackAssignee[]> {
  const { data, error } = await supabase.rpc('feedback_assignees')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { id: string; full_name: string | null; assignable?: boolean }[]
  return rows.map((row) => ({
    id: row.id,
    full_name: row.full_name?.trim() || 'ללא שם',
    assignable: row.assignable !== false,
  }))
}

export async function setUserFeedbackAssignee(
  id: string,
  assigneeId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('user_feedback')
    .update({ assignee_id: assigneeId })
    .eq('id', id)
  if (error) return { ok: false, error: FEEDBACK_UPDATE_ERROR }
  return { ok: true }
}

/** A task a super admin opens from the inbox: no kind, no recording, no SMS on done. */
export async function createFeedbackTask(input: {
  title: string
  body: string
  assigneeId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const error = feedbackTaskError(input)
  if (error) return { ok: false, error }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: FEEDBACK_TASK_SAVE_ERROR }

  const { error: insertError } = await supabase.from('user_feedback').insert({
    user_id: user.id,
    kind: null,
    title: input.title.trim(),
    body: input.body.trim() || null,
    status: 'open',
    assignee_id: input.assigneeId,
  })
  if (insertError) return { ok: false, error: FEEDBACK_TASK_SAVE_ERROR }
  return { ok: true }
}

export async function updateFeedbackTask(
  id: string,
  input: { title: string; body: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const error = feedbackTaskError(input)
  if (error) return { ok: false, error }
  const { error: updateError } = await supabase
    .from('user_feedback')
    .update({ title: input.title.trim(), body: input.body.trim() || null })
    .eq('id', id)
  if (updateError) return { ok: false, error: FEEDBACK_TASK_SAVE_ERROR }
  return { ok: true }
}

export const FEEDBACK_BOARD_ORDER_ERROR = 'הסדר בעמודה לא נשמר. נסו שוב.'
export const FEEDBACK_BOARD_NOTE_ERROR = 'שמירת ההערה נכשלה. נסו שוב.'
export const FEEDBACK_BOARD_UNAVAILABLE = 'סדר הכרטיסים וההערות עדיין לא זמינים במערכת.'

/** Writes card positions in one call. Only the position column is sent, so a note is kept. */
export async function saveFeedbackBoardPositions(
  positions: readonly { id: string; position: number }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (positions.length === 0) return { ok: true }
  const { error } = await supabase
    .from('user_feedback_board')
    .upsert(
      positions.map((item) => ({ feedback_id: item.id, position: item.position })),
      { onConflict: 'feedback_id' },
    )
  if (error) {
    return {
      ok: false,
      error: isMissingFeedbackBoardTable(error) ? FEEDBACK_BOARD_UNAVAILABLE : FEEDBACK_BOARD_ORDER_ERROR,
    }
  }
  return { ok: true }
}

export async function saveFeedbackBoardNote(
  id: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = note.trim()
  const bodyErr = feedbackBodyError(trimmed)
  if (bodyErr) return { ok: false, error: bodyErr }
  const { error } = await supabase
    .from('user_feedback_board')
    .upsert({ feedback_id: id, note: trimmed || null }, { onConflict: 'feedback_id' })
  if (error) {
    return {
      ok: false,
      error: isMissingFeedbackBoardTable(error) ? FEEDBACK_BOARD_UNAVAILABLE : FEEDBACK_BOARD_NOTE_ERROR,
    }
  }
  return { ok: true }
}
