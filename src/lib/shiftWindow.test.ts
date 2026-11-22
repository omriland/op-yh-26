import { describe, expect, it } from 'vitest'
import { crewCanEdit, rangesOverlap, shiftWindowPhase } from './shiftWindow'
import { defaultShiftHours } from './shifts'

const LIVE_SHIFT = {
  starts_at: '2026-11-22T07:00:00.000Z',
  ends_at: '2026-11-22T15:00:00.000Z',
}
const HOUR_MS = 60 * 60 * 1000

function at(iso: string): Date {
  return new Date(iso)
}

describe('shiftWindowPhase', () => {
  it('is planned just before starts_at', () => {
    expect(shiftWindowPhase(LIVE_SHIFT, at('2026-11-22T06:59:59.999Z'))).toBe('planned')
  })

  it('is active exactly at starts_at', () => {
    expect(shiftWindowPhase(LIVE_SHIFT, at(LIVE_SHIFT.starts_at))).toBe('active')
  })

  it('stays active until just before ends_at', () => {
    expect(shiftWindowPhase(LIVE_SHIFT, at('2026-11-22T14:59:59.999Z'))).toBe('active')
  })

  it('is finishing exactly at ends_at', () => {
    expect(shiftWindowPhase(LIVE_SHIFT, at(LIVE_SHIFT.ends_at))).toBe('finishing')
  })

  it('stays finishing until just before ends_at + 48 hours', () => {
    const justBeforeClose = new Date(new Date(LIVE_SHIFT.ends_at).getTime() + 48 * HOUR_MS - 1)
    expect(shiftWindowPhase(LIVE_SHIFT, justBeforeClose)).toBe('finishing')
  })

  it('is closed exactly at ends_at + 48 hours', () => {
    const closeMoment = new Date(new Date(LIVE_SHIFT.ends_at).getTime() + 48 * HOUR_MS)
    expect(shiftWindowPhase(LIVE_SHIFT, closeMoment)).toBe('closed')
  })

  it('is legacy when both times are null', () => {
    const legacyShift = { starts_at: null, ends_at: null }
    expect(shiftWindowPhase(legacyShift, at('2026-11-22T10:00:00.000Z'))).toBe('legacy')
  })
})

describe('crewCanEdit', () => {
  it('is true only for active and finishing', () => {
    expect(crewCanEdit('active')).toBe(true)
    expect(crewCanEdit('finishing')).toBe(true)
    expect(crewCanEdit('planned')).toBe(false)
    expect(crewCanEdit('closed')).toBe(false)
    expect(crewCanEdit('legacy')).toBe(false)
  })
})

describe('rangesOverlap', () => {
  const morning = { start: at('2026-11-22T07:00:00Z'), end: at('2026-11-22T15:00:00Z') }

  it('is true for partly overlapping ranges', () => {
    const lateStart = { start: at('2026-11-22T14:00:00Z'), end: at('2026-11-22T22:00:00Z') }
    expect(rangesOverlap(morning, lateStart)).toBe(true)
    expect(rangesOverlap(lateStart, morning)).toBe(true)
  })

  it('is false when edges only touch', () => {
    const midday = { start: at('2026-11-22T15:00:00Z'), end: at('2026-11-22T23:00:00Z') }
    expect(rangesOverlap(morning, midday)).toBe(false)
    expect(rangesOverlap(midday, morning)).toBe(false)
  })

  it('is true when one range contains the other', () => {
    const inside = { start: at('2026-11-22T09:00:00Z'), end: at('2026-11-22T10:00:00Z') }
    expect(rangesOverlap(morning, inside)).toBe(true)
    expect(rangesOverlap(inside, morning)).toBe(true)
  })

  it('is false for clearly separate ranges', () => {
    const nextDay = { start: at('2026-11-23T07:00:00Z'), end: at('2026-11-23T15:00:00Z') }
    expect(rangesOverlap(morning, nextDay)).toBe(false)
  })
})

describe('defaultShiftHours', () => {
  it('gives morning 07:00-15:00', () => {
    expect(defaultShiftHours('morning')).toEqual({ start: '07:00', end: '15:00' })
  })

  it('gives midday 15:00-23:00', () => {
    expect(defaultShiftHours('midday')).toEqual({ start: '15:00', end: '23:00' })
  })

  it('gives null for kinds without fixed hours', () => {
    expect(defaultShiftHours('reinforcement')).toBeNull()
    expect(defaultShiftHours('escort')).toBeNull()
    expect(defaultShiftHours('other')).toBeNull()
  })
})
