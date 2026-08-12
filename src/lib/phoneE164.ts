import { phoneDigits } from './format'

/** True when raw is an Israeli mobile: 10 digits starting with 05. */
export function isValidIlMobile(raw: string | null | undefined): boolean {
  const digits = phoneDigits(raw ?? '')
  return digits.length === 10 && digits.startsWith('05')
}

/** 0501234567 → +972501234567. Null if not a valid IL mobile. */
export function toE164IlMobile(raw: string | null | undefined): string | null {
  if (!isValidIlMobile(raw)) return null
  const digits = phoneDigits(raw ?? '')
  return `+972${digits.slice(1)}`
}

/** 0501234567 → 050-***-4567. Null if invalid. */
export function maskIlMobile(raw: string | null | undefined): string | null {
  if (!isValidIlMobile(raw)) return null
  const digits = phoneDigits(raw ?? '')
  return `${digits.slice(0, 3)}-***-${digits.slice(6)}`
}
