import { isValidPhone } from './format'

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
