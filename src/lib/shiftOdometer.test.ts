import { describe, expect, it } from 'vitest'
import { SHIFT_ODOMETER_ORDER_ERROR } from './shiftForm'
import {
  SHIFT_ODOMETER_INCOMPLETE_ERROR,
  validateShiftOdometer,
} from './shiftOdometer'

describe('validateShiftOdometer', () => {
  it('requires both readings', () => {
    expect(validateShiftOdometer(null, null)).toBe(SHIFT_ODOMETER_INCOMPLETE_ERROR)
    expect(validateShiftOdometer(100, null)).toBe(SHIFT_ODOMETER_INCOMPLETE_ERROR)
    expect(validateShiftOdometer(null, 100)).toBe(SHIFT_ODOMETER_INCOMPLETE_ERROR)
  })

  it('rejects a reversed pair with the same message the form uses', () => {
    expect(validateShiftOdometer(120000, 119800)).toBe(SHIFT_ODOMETER_ORDER_ERROR)
  })

  it('accepts an equal pair — a shift whose vehicle never left base', () => {
    expect(validateShiftOdometer(120000, 120000)).toBeUndefined()
  })

  it('accepts an ascending pair', () => {
    expect(validateShiftOdometer(120000, 120412)).toBeUndefined()
  })

  it('states both messages without an exclamation mark', () => {
    expect(SHIFT_ODOMETER_INCOMPLETE_ERROR).not.toContain('!')
    expect(SHIFT_ODOMETER_ORDER_ERROR).not.toContain('!')
  })
})
