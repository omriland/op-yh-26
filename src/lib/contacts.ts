import { formatPhone, phoneDigits } from './format'
import { isValidIlMobile } from './phoneE164'
import { fieldsMatchQuery } from './searchQuery'
import { supabase } from './supabase'

export type UnitContact = {
  id: string
  full_name: string
  callsign: string
  phone: string | null
  email: string
}

/** 0501234567 → tel:+972501234567. Null if not 10 digits. */
export function toTelHref(raw: string | null | undefined): string | null {
  const digits = phoneDigits(raw ?? '')
  if (digits.length !== 10) return null
  return `tel:+972${digits.slice(1)}`
}

/** Israeli mobile only → https://wa.me/972… */
export function toWhatsAppHref(raw: string | null | undefined): string | null {
  if (!isValidIlMobile(raw)) return null
  const digits = phoneDigits(raw ?? '')
  return `https://wa.me/972${digits.slice(1)}`
}

export function filterContacts(
  contacts: readonly UnitContact[],
  query: string,
): UnitContact[] {
  const trimmed = query.trim()
  if (!trimmed) return [...contacts]
  const queryDigits = phoneDigits(trimmed)
  return contacts.filter((contact) => {
    if (
      fieldsMatchQuery(
        [
          contact.full_name,
          contact.callsign,
          contact.email,
          contact.phone,
          contact.phone ? formatPhone(contact.phone) : '',
        ],
        trimmed,
      )
    ) {
      return true
    }
    return (
      queryDigits.length >= 3 &&
      Boolean(contact.phone) &&
      phoneDigits(contact.phone ?? '').includes(queryDigits)
    )
  })
}

export type ContactSortKey = 'full_name' | 'callsign' | 'phone' | 'email'
export type SortDirection = 'asc' | 'desc'

/** Hebrew-aware, numbers in numeric order (D2 before D12). Missing phones stay last. */
export function sortContacts(
  contacts: readonly UnitContact[],
  key: ContactSortKey,
  direction: SortDirection,
): UnitContact[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...contacts].sort((a, b) => {
    const left = a[key] ?? ''
    const right = b[key] ?? ''
    if (!left || !right) return left ? -1 : right ? 1 : 0
    return sign * left.localeCompare(right, 'he', { numeric: true, sensitivity: 'base' })
  })
}

export async function fetchUnitContacts(): Promise<UnitContact[]> {
  const { data, error } = await supabase.rpc('list_unit_contacts')
  if (error) throw new Error(error.message)
  return (data ?? []) as UnitContact[]
}
