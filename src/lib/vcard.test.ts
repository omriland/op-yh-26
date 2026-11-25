import { describe, expect, it } from 'vitest'
import type { UnitContact } from './contacts'
import { buildContactVCard, vCardFileName } from './vcard'

const full: UnitContact = {
  id: '1',
  full_name: 'עמרי לנדמן',
  callsign: 'Admin',
  phone: '0501234567',
  email: 'omri@example.com',
}

function make(overrides: Partial<UnitContact>): UnitContact {
  return { ...full, ...overrides }
}

function lines(card: string): string[] {
  return card.split('\r\n')
}

describe('buildContactVCard', () => {
  it('builds the full card for a complete contact, joined with CRLF', () => {
    expect(buildContactVCard(full)).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:עמרי לנדמן יחפצ Admin',
        'N:;עמרי לנדמן יחפצ Admin;;;',
        'NICKNAME:Admin',
        'TEL;TYPE=CELL:+972501234567',
        'EMAIL;TYPE=INTERNET:omri@example.com',
        'END:VCARD',
        '',
      ].join('\r\n'),
    )
  })

  it('ends with END:VCARD followed by CRLF and uses no bare newlines', () => {
    const card = buildContactVCard(full)
    expect(card.endsWith('END:VCARD\r\n')).toBe(true)
    expect(card.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('uses the full name and יחפצ when there is no callsign', () => {
    const card = buildContactVCard(make({ callsign: '' }))
    expect(lines(card)).toContain('FN:עמרי לנדמן יחפצ')
    expect(lines(card)).toContain('N:;עמרי לנדמן יחפצ;;;')
    expect(card).not.toContain('NICKNAME')
  })

  it('treats a whitespace-only callsign as empty', () => {
    const card = buildContactVCard(make({ callsign: '   ' }))
    expect(lines(card)).toContain('FN:עמרי לנדמן יחפצ')
    expect(card).not.toContain('NICKNAME')
    expect(card).not.toContain('יחפצ ')
  })

  it('trims the callsign before using it', () => {
    const card = buildContactVCard(make({ callsign: '  D12 ' }))
    expect(lines(card)).toContain('FN:עמרי לנדמן יחפצ D12')
    expect(lines(card)).toContain('NICKNAME:D12')
  })

  it('omits TEL when the phone is missing', () => {
    expect(buildContactVCard(make({ phone: null }))).not.toContain('TEL')
  })

  it('omits TEL for a 9 digit number', () => {
    expect(buildContactVCard(make({ phone: '050123456' }))).not.toContain('TEL')
  })

  it('omits TEL for an empty or digit-less phone', () => {
    expect(buildContactVCard(make({ phone: '' }))).not.toContain('TEL')
    expect(buildContactVCard(make({ phone: 'abc' }))).not.toContain('TEL')
  })

  it('converts a formatted 10 digit number to E.164', () => {
    const card = buildContactVCard(make({ phone: '050-123-4567' }))
    expect(lines(card)).toContain('TEL;TYPE=CELL:+972501234567')
  })

  it('converts a landline-style 10 digit number the same way as toTelHref', () => {
    const card = buildContactVCard(make({ phone: '0312345678' }))
    expect(lines(card)).toContain('TEL;TYPE=CELL:+972312345678')
  })

  it('omits EMAIL when the email is empty', () => {
    expect(buildContactVCard(make({ email: '' }))).not.toContain('EMAIL')
  })

  describe('escaping in the name', () => {
    const nameLines = (name: string) =>
      lines(buildContactVCard(make({ full_name: name, callsign: '' })))

    it('escapes a comma', () => {
      expect(nameLines('a,b')).toContain('FN:a\\,b יחפצ')
      expect(nameLines('a,b')).toContain('N:;a\\,b יחפצ;;;')
    })

    it('escapes a semicolon', () => {
      expect(nameLines('a;b')).toContain('FN:a\\;b יחפצ')
      expect(nameLines('a;b')).toContain('N:;a\\;b יחפצ;;;')
    })

    it('escapes a backslash', () => {
      expect(nameLines('a\\b')).toContain('FN:a\\\\b יחפצ')
      expect(nameLines('a\\b')).toContain('N:;a\\\\b יחפצ;;;')
    })

    it('escapes a newline and does not add card lines', () => {
      const card = buildContactVCard(make({ full_name: 'a\nb', callsign: '' }))
      expect(lines(card)).toContain('FN:a\\nb יחפצ')
      expect(lines(card)).toContain('N:;a\\nb יחפצ;;;')
      // BEGIN, VERSION, FN, N, TEL, EMAIL, END and the empty element after the final CRLF
      expect(lines(card)).toHaveLength(8)
    })

    it('escapes a backslash before a comma without double-escaping', () => {
      expect(nameLines('a\\,b')).toContain('FN:a\\\\\\,b יחפצ')
    })
  })

  describe('escaping in the callsign', () => {
    const callsignLines = (callsign: string) =>
      lines(buildContactVCard(make({ full_name: 'n', callsign })))

    it('escapes a comma', () => {
      expect(callsignLines('x,y')).toContain('NICKNAME:x\\,y')
      expect(callsignLines('x,y')).toContain('FN:n יחפצ x\\,y')
    })

    it('escapes a semicolon', () => {
      expect(callsignLines('x;y')).toContain('NICKNAME:x\\;y')
      expect(callsignLines('x;y')).toContain('FN:n יחפצ x\\;y')
    })

    it('escapes a backslash', () => {
      expect(callsignLines('x\\y')).toContain('NICKNAME:x\\\\y')
      expect(callsignLines('x\\y')).toContain('FN:n יחפצ x\\\\y')
    })

    it('escapes a newline', () => {
      expect(callsignLines('x\ny')).toContain('NICKNAME:x\\ny')
      expect(callsignLines('x\ny')).toContain('FN:n יחפצ x\\ny')
    })
  })

  describe('escaping in the email', () => {
    const emailLine = (email: string) =>
      lines(buildContactVCard(make({ email }))).find((l) => l.startsWith('EMAIL'))

    it('escapes a comma', () => {
      expect(emailLine('a,b@x.com')).toBe('EMAIL;TYPE=INTERNET:a\\,b@x.com')
    })

    it('escapes a semicolon', () => {
      expect(emailLine('a;b@x.com')).toBe('EMAIL;TYPE=INTERNET:a\\;b@x.com')
    })

    it('escapes a backslash', () => {
      expect(emailLine('a\\b@x.com')).toBe('EMAIL;TYPE=INTERNET:a\\\\b@x.com')
    })

    it('escapes a newline', () => {
      expect(emailLine('a\nb@x.com')).toBe('EMAIL;TYPE=INTERNET:a\\nb@x.com')
    })
  })

  it('accepts a valid number written with spaces', () => {
    const card = buildContactVCard(make({ phone: '050 123 4567' }))
    expect(lines(card)).toContain('TEL;TYPE=CELL:+972501234567')
  })

  it('keeps Hebrew text as plain UTF-8 without encoding', () => {
    const card = buildContactVCard(make({ full_name: 'דנה כהן', callsign: 'ד12' }))
    expect(card).toContain('FN:דנה כהן יחפצ ד12')
    expect(card).not.toMatch(/CHARSET|ENCODING|=D7/i)
  })
})

describe('vCardFileName', () => {
  it('uses the full name with a .vcf extension', () => {
    expect(vCardFileName(full)).toBe('עמרי לנדמן.vcf')
  })

  it('removes characters that are invalid in file names', () => {
    expect(vCardFileName(make({ full_name: 'a/b\\c:d*e?f"g<h>i|j' }))).toBe(
      'abcdefghij.vcf',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(vCardFileName(make({ full_name: '  דנה כהן  ' }))).toBe('דנה כהן.vcf')
  })

  it('trims whitespace left over after removing invalid characters', () => {
    expect(vCardFileName(make({ full_name: '/ דנה /' }))).toBe('דנה.vcf')
  })

  it('falls back to contact.vcf when nothing is left', () => {
    expect(vCardFileName(make({ full_name: '' }))).toBe('contact.vcf')
    expect(vCardFileName(make({ full_name: '   ' }))).toBe('contact.vcf')
    expect(vCardFileName(make({ full_name: '/\\:*?"<>|' }))).toBe('contact.vcf')
  })
})
