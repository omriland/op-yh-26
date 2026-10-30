import { describe, expect, it } from 'vitest'
import { maskPid } from './legacyReport'

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
