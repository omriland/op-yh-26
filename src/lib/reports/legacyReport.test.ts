import { describe, expect, it } from 'vitest'
import { legacyReportFileName, maskPid } from './legacyReport'

describe('maskPid', () => {
  it('keeps only the last 3 digits of an ID number', () => {
    expect(maskPid('000000018')).toBe('******018')
    expect(maskPid(' 000000018 ')).toBe('******018')
  })

  it('leaves a value the server already masked as it is', () => {
    expect(maskPid('******018')).toBe('******018')
  })

  it('shows no digits of a value too short to mask', () => {
    expect(maskPid('18')).toBe('******')
    expect(maskPid('018')).toBe('******')
  })

  it('returns an empty string when there is no ID', () => {
    expect(maskPid(null)).toBe('')
    expect(maskPid(undefined)).toBe('')
    expect(maskPid('   ')).toBe('')
  })
})

describe('legacyReportFileName', () => {
  it('is eventNumber_date_callSign', () => {
    expect(legacyReportFileName({ eventNumber: '2439', eventDate: '2022-09-05', callSign: '752' })).toBe(
      '2439_05-09-2022_752',
    )
  })

  it('drops missing parts and unsafe characters', () => {
    expect(legacyReportFileName({ eventNumber: '', eventDate: '2022-09-05', callSign: '7/52' })).toBe('05-09-2022_7-52')
    expect(legacyReportFileName({ eventNumber: '', eventDate: '', callSign: '' })).toBe('event')
  })
})
