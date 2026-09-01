import { isValidPhone } from './format'
import {
  clearFillDraft,
  readFillDraft,
  stashFillDraft,
} from './fillDraftStash'

export type CreateUserDraftFields = {
  full_name: string
  email: string
  callsign: string
  phone: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim())
}

export function emailsDiffer(a: string, b: string): boolean {
  return a.trim().toLowerCase() !== b.trim().toLowerCase()
}

/** Create is always editable; existing users only for Super Admin. */
export function canEditUserEmail(isCreate: boolean, actorIsSuperAdmin: boolean): boolean {
  return isCreate || actorIsSuperAdmin
}

export function userEmailFieldHint(isCreate: boolean, actorIsSuperAdmin: boolean): string {
  if (isCreate) return 'נשלחת הזמנה לכתובת זו. הקישור בתוקף ל־24 שעות.'
  if (actorIsSuperAdmin) return 'שינוי דוא״ל מעדכן גם את פרטי ההתחברות.'
  return 'לא ניתן לשנות דוא״ל לאחר יצירה.'
}

/** Inline create-form message. Empty stays silent so a blank form is not already in error. */
export function createUserEmailError(raw: string): string | null {
  if (raw.trim() === '') return null
  return isValidEmail(raw) ? null : 'יש להזין כתובת דוא״ל תקינה.'
}

/** True when the create-user form has the four required identity fields. */
export function canSubmitCreateUser(draft: CreateUserDraftFields): boolean {
  return (
    draft.full_name.trim() !== '' &&
    isValidEmail(draft.email) &&
    draft.callsign.trim() !== '' &&
    isValidPhone(draft.phone)
  )
}

export const USER_CREATE_STASH_SCOPE = 'userCreate'
export const USER_CREATE_STASH_DEBOUNCE_MS = 600

export function userCreateStashId(actorId: string): string {
  return `${actorId}:new`
}

export type CreateUserStashDraft = CreateUserDraftFields & {
  id?: string
  volunteer_status?: string
  roles?: string[]
  vehicles?: unknown[]
  addresses?: { location?: string }[]
}

/** True when the create dialog has anything worth keeping across a remount. */
export function shouldStashCreateUserDraft(draft: CreateUserStashDraft): boolean {
  if (draft.id) return false
  if (draft.full_name.trim()) return true
  if (draft.email.trim()) return true
  if (draft.callsign.trim()) return true
  if (draft.phone.trim()) return true
  if ((draft.vehicles?.length ?? 0) > 0) return true
  return (draft.addresses ?? []).some((row) => (row.location ?? '').trim() !== '')
}

export function applyStashedCreateUserDraft<T extends CreateUserStashDraft>(
  base: T,
  stashed: unknown,
): T | null {
  if (!stashed || typeof stashed !== 'object') return null
  const draft = stashed as Partial<CreateUserStashDraft>
  if (typeof draft.full_name !== 'string') return null
  if (draft.id) return null
  return { ...base, ...draft, id: undefined }
}

export function readCreateUserStash<T>(actorId: string, now: number): T | null {
  return (
    readFillDraft<T>(USER_CREATE_STASH_SCOPE, userCreateStashId(actorId), now)?.draft ??
    null
  )
}

export function stashCreateUserDraft(
  actorId: string,
  draft: CreateUserStashDraft,
  now: number,
): void {
  if (!shouldStashCreateUserDraft(draft)) {
    clearCreateUserStash(actorId)
    return
  }
  stashFillDraft(USER_CREATE_STASH_SCOPE, userCreateStashId(actorId), draft, now)
}

export function clearCreateUserStash(actorId: string): void {
  clearFillDraft(USER_CREATE_STASH_SCOPE, userCreateStashId(actorId))
}
