import { describe, expect, it } from 'vitest'
import { filterContacts, toTelHref, toWhatsAppHref, type UnitContact } from './contacts'

const omri: UnitContact = {
  id: '1',
  full_name: 'עמרי לנדמן',
  callsign: 'Admin',
  phone: '0501234567',
  email: 'omri@example.com',
}

const dana: UnitContact = {
  id: '2',
  full_name: 'דנה כהן',
  callsign: 'D12',
  phone: '0312345678',
  email: 'dana@yahpz.com',
}

const noPhone: UnitContact = {
  id: '3',
  full_name: 'גיא לוי',
  callsign: 'G1',
  phone: null,
  email: 'guy@yahpz.com',
}

describe('toTelHref', () => {
  it('builds a tel link from a 10-digit Israeli number', () => {
    expect(toTelHref('0501234567')).toBe('tel:+972501234567')
    expect(toTelHref('03-123-45678')).toBe('tel:+972312345678')
  })

  it('returns null when the number is missing or incomplete', () => {
    expect(toTelHref(null)).toBeNull()
    expect(toTelHref('050123456')).toBeNull()
    expect(toTelHref('')).toBeNull()
  })
})

describe('toWhatsAppHref', () => {
  it('builds a wa.me link for Israeli mobiles only', () => {
    expect(toWhatsAppHref('050-123-4567')).toBe('https://wa.me/972501234567')
  })

  it('returns null for landlines and missing numbers', () => {
    expect(toWhatsAppHref('0312345678')).toBeNull()
    expect(toWhatsAppHref(null)).toBeNull()
  })
})

describe('filterContacts', () => {
  const contacts = [omri, dana, noPhone]

  it('returns everyone when the query is blank', () => {
    expect(filterContacts(contacts, '  ')).toEqual(contacts)
  })

  it('matches full name, callsign, email, and phone', () => {
    expect(filterContacts(contacts, 'עמרי').map((row) => row.id)).toEqual(['1'])
    expect(filterContacts(contacts, 'D12').map((row) => row.id)).toEqual(['2'])
    expect(filterContacts(contacts, 'guy@').map((row) => row.id)).toEqual(['3'])
    expect(filterContacts(contacts, '050-123').map((row) => row.id)).toEqual(['1'])
    expect(filterContacts(contacts, '501234').map((row) => row.id)).toEqual(['1'])
  })

  it('matches Hebrew typed on an English keyboard', () => {
    expect(filterContacts(contacts, 'gnrh').map((row) => row.id)).toEqual(['1'])
  })
})
