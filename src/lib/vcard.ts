import type { UnitContact } from './contacts'
import { phoneDigits } from './format'

const LINE_BREAK = '\r\n'
const INVALID_FILE_NAME_CHARACTERS = /[/\\:*?"<>|]/g

/** RFC 2426 text escaping. The backslash goes first so later escapes are not doubled. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** 0501234567 → +972501234567. Null unless the number has 10 digits. */
function toInternationalPhone(raw: string | null): string | null {
  const digits = phoneDigits(raw ?? '')
  if (digits.length !== 10) return null
  return `+972${digits.slice(1)}`
}

const ORGANISATION_TAG = 'יחפצ'

/** "<full name> יחפצ <callsign>", e.g. "אבי איובי יחפצ 445". */
function displayName(fullName: string, callsign: string): string {
  const withTag = `${fullName} ${ORGANISATION_TAG}`
  return callsign ? `${withTag} ${callsign}` : withTag
}

/** A vCard 3.0 contact card, ready to save into a phone's contacts. */
export function buildContactVCard(contact: UnitContact): string {
  const callsign = contact.callsign.trim()
  const name = escapeText(displayName(contact.full_name, callsign))
  const phone = toInternationalPhone(contact.phone)
  const email = contact.email

  const cardLines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:;${name};;;`,
    callsign ? `NICKNAME:${escapeText(callsign)}` : null,
    phone ? `TEL;TYPE=CELL:${phone}` : null,
    email ? `EMAIL;TYPE=INTERNET:${escapeText(email)}` : null,
    'END:VCARD',
  ].filter((line): line is string => line !== null)

  return cardLines.join(LINE_BREAK) + LINE_BREAK
}

/** "<full name>.vcf" without characters a file name cannot hold. */
export function vCardFileName(contact: UnitContact): string {
  const baseName = contact.full_name.replace(INVALID_FILE_NAME_CHARACTERS, '').trim()
  return `${baseName || 'contact'}.vcf`
}
