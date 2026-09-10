import { describe, expect, it } from 'vitest'
import {
  PATROL_CALLSIGN_NUMBER_MAX_LENGTH,
  formatPatrolCallsign,
  patrolCallsignNumberForInput,
  patrolCallsignPrefixForInput,
  resolvePatrolCallsign,
  splitPatrolCallsign,
} from './patrolCallsign'

describe('splitPatrolCallsign', () => {
  it('puts a number-only value in the number field', () => {
    expect(splitPatrolCallsign('411')).toEqual({ prefix: '', number: '411' })
    expect(splitPatrolCallsign('  12  ')).toEqual({ prefix: '', number: '12' })
  })

  it('puts text-only values in the prefix field', () => {
    expect(splitPatrolCallsign('אביב')).toEqual({ prefix: 'אביב', number: '' })
    expect(splitPatrolCallsign('ניידת')).toEqual({ prefix: 'ניידת', number: '' })
  })

  it('extracts the last digit run from mixed values', () => {
    expect(splitPatrolCallsign('אביב 411')).toEqual({ prefix: 'אביב', number: '411' })
    expect(splitPatrolCallsign('אביב411')).toEqual({ prefix: 'אביב', number: '411' })
    expect(splitPatrolCallsign('אביב 411 ב')).toEqual({ prefix: 'אביב ב', number: '411' })
    expect(splitPatrolCallsign('12 אביב 411')).toEqual({ prefix: '12 אביב', number: '411' })
  })

  it('caps a long last digit run at 5', () => {
    expect(splitPatrolCallsign('123456')).toEqual({ prefix: '', number: '12345' })
    expect(splitPatrolCallsign('אביב 1234567')).toEqual({ prefix: 'אביב', number: '12345' })
  })

  it('treats empty as both blank', () => {
    expect(splitPatrolCallsign(null)).toEqual({ prefix: '', number: '' })
    expect(splitPatrolCallsign('   ')).toEqual({ prefix: '', number: '' })
  })
})

describe('formatPatrolCallsign', () => {
  it('joins prefix and number with a space', () => {
    expect(formatPatrolCallsign('אביב', '411')).toBe('אביב 411')
    expect(formatPatrolCallsign('', '411')).toBe('411')
    expect(formatPatrolCallsign('אביב', '')).toBe('אביב')
    expect(formatPatrolCallsign('  ', '  ')).toBe('')
  })
})

describe('input filters', () => {
  it('caps prefix length and number digits', () => {
    expect(PATROL_CALLSIGN_NUMBER_MAX_LENGTH).toBe(5)
    expect(patrolCallsignNumberForInput('12a3456')).toBe('12345')
    expect(patrolCallsignPrefixForInput('א'.repeat(20)).length).toBe(16)
  })
})

describe('resolvePatrolCallsign', () => {
  it('prefers split columns over the legacy combined value', () => {
    expect(
      resolvePatrolCallsign({ prefix: 'אביב', number: '411', legacy: 'ישן' }),
    ).toEqual({ prefix: 'אביב', number: '411' })
  })

  it('falls back to splitting the legacy value', () => {
    expect(resolvePatrolCallsign({ legacy: 'אביב411' })).toEqual({
      prefix: 'אביב',
      number: '411',
    })
  })
})
