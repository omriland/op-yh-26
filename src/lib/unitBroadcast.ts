import { formatNumber } from './format'
import { isValidIlMobile } from './phoneE164'

export type BroadcastChannel = 'email' | 'sms' | 'both'
export type BroadcastAudience = 'all' | 'admins' | 'shift_leads'

export type BroadcastCandidate = {
  id: string
  email: string | null
  phone: string | null
  roles: string[]
  active: boolean
  invite_pending: boolean
}

export type BroadcastDraft = {
  channel: BroadcastChannel
  audience: BroadcastAudience
  subject: string
  body: string
}

export type BroadcastPreview = {
  audienceCount: number
  recipientCount: number
  emailCount: number
  smsCount: number
  skippedNoPhone: number
  skippedNoEmail: number
  canSend: boolean
}

export const BROADCAST_SUBJECT_MAX = 200
export const BROADCAST_BODY_MAX = 2000

export const BROADCAST_CHANNELS: { id: BroadcastChannel; label: string }[] = [
  { id: 'email', label: 'אימייל' },
  { id: 'sms', label: 'SMS' },
  { id: 'both', label: 'SMS + אימייל' },
]

export const BROADCAST_AUDIENCES: { id: BroadcastAudience; label: string }[] = [
  { id: 'all', label: 'כלל המשתמשים' },
  { id: 'admins', label: 'מנהלים' },
  { id: 'shift_leads', label: 'אחמ״שים' },
]

export function needsBroadcastSubject(channel: BroadcastChannel): boolean {
  return channel !== 'sms'
}

export function broadcastChannelLabel(channel: BroadcastChannel): string {
  return BROADCAST_CHANNELS.find((item) => item.id === channel)?.label ?? channel
}

export function broadcastAudienceLabel(audience: BroadcastAudience): string {
  return BROADCAST_AUDIENCES.find((item) => item.id === audience)?.label ?? audience
}

function isEligible(user: BroadcastCandidate): boolean {
  return user.active && !user.invite_pending
}

function matchesAudience(user: BroadcastCandidate, audience: BroadcastAudience): boolean {
  if (audience === 'all') return true
  if (audience === 'admins') return user.roles.includes('admin')
  return user.roles.includes('shift_lead')
}

function hasEmail(user: BroadcastCandidate): boolean {
  return Boolean(user.email?.trim())
}

function hasSms(user: BroadcastCandidate): boolean {
  return isValidIlMobile(user.phone)
}

export function previewUnitBroadcast(
  users: BroadcastCandidate[],
  input: Pick<BroadcastDraft, 'channel' | 'audience'>,
): BroadcastPreview {
  const audienceUsers = users.filter((user) => isEligible(user) && matchesAudience(user, input.audience))
  const wantsEmail = input.channel !== 'sms'
  const wantsSms = input.channel !== 'email'

  let emailCount = 0
  let smsCount = 0
  let skippedNoEmail = 0
  let skippedNoPhone = 0
  let recipientCount = 0

  for (const user of audienceUsers) {
    const emailOk = wantsEmail && hasEmail(user)
    const smsOk = wantsSms && hasSms(user)
    if (wantsEmail && !hasEmail(user)) skippedNoEmail += 1
    if (wantsSms && !hasSms(user)) skippedNoPhone += 1
    if (emailOk) emailCount += 1
    if (smsOk) smsCount += 1
    if (emailOk || smsOk) recipientCount += 1
  }

  return {
    audienceCount: audienceUsers.length,
    recipientCount,
    emailCount,
    smsCount,
    skippedNoPhone,
    skippedNoEmail,
    canSend: recipientCount > 0,
  }
}

function audienceNoun(audience: BroadcastAudience): string {
  if (audience === 'admins') return 'מנהלים פעילים'
  if (audience === 'shift_leads') return 'אחמ״שים פעילים'
  return 'משתמשים פעילים'
}

export function unitBroadcastConfirmCopy(
  preview: BroadcastPreview,
  input: Pick<BroadcastDraft, 'channel' | 'audience'>,
): string {
  if (!preview.canSend) return 'אין נמענים לשליחה בקהל ובערוץ שנבחרו.'

  const skips: string[] = []
  if (preview.skippedNoPhone > 0) {
    skips.push(`${formatNumber(preview.skippedNoPhone)} בלי טלפון ידולגו`)
  }
  if (preview.skippedNoEmail > 0) {
    skips.push(`${formatNumber(preview.skippedNoEmail)} בלי דוא״ל ידולגו`)
  }

  const head = `יישלח ל־${formatNumber(preview.recipientCount)} ${audienceNoun(input.audience)} (${broadcastChannelLabel(input.channel)}).`
  if (skips.length === 0) return `${head} לשלוח?`
  return `${head} ${skips.join('. ')}. לשלוח?`
}

export function unitBroadcastResultCopy(result: {
  recipientCount: number
  skippedNoPhone: number
  skippedNoEmail: number
  failedCount: number
}): string {
  const parts = [`נשלח ל־${formatNumber(result.recipientCount)}.`]
  if (result.skippedNoPhone > 0) {
    parts.push(`${formatNumber(result.skippedNoPhone)} בלי טלפון דולגו.`)
  }
  if (result.skippedNoEmail > 0) {
    parts.push(`${formatNumber(result.skippedNoEmail)} בלי דוא״ל דולגו.`)
  }
  if (result.failedCount > 0) {
    parts.push(`${formatNumber(result.failedCount)} נכשלו.`)
  }
  return parts.join(' ')
}

export function validateUnitBroadcastDraft(
  draft: Pick<BroadcastDraft, 'channel' | 'subject' | 'body'>,
): { subject?: string; body?: string } {
  const errors: { subject?: string; body?: string } = {}
  const subject = draft.subject.trim()
  const body = draft.body.trim()

  if (needsBroadcastSubject(draft.channel)) {
    if (!subject) errors.subject = 'יש למלא נושא לדוא״ל.'
    else if (subject.length > BROADCAST_SUBJECT_MAX) errors.subject = 'הנושא ארוך מדי.'
  }

  if (!body) errors.body = 'יש למלא את תוכן ההודעה.'
  else if (body.length > BROADCAST_BODY_MAX) errors.body = 'ההודעה ארוכה מדי.'

  return errors
}
