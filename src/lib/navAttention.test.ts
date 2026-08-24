import { describe, expect, it } from 'vitest'
import {
  hasOpenMineEvents,
  hasOpenMineShifts,
  navAttentionAriaSuffix,
} from './navAttention'

describe('hasOpenMineEvents', () => {
  it('is true when any own participation is not done', () => {
    expect(
      hasOpenMineEvents([
        { status: 'done' },
        { status: 'pending' },
      ]),
    ).toBe(true)
  })

  it('is true for in_progress', () => {
    expect(hasOpenMineEvents([{ status: 'in_progress' }])).toBe(true)
  })

  it('is false when every participation is done', () => {
    expect(hasOpenMineEvents([{ status: 'done' }, { status: 'done' }])).toBe(false)
  })

  it('is false when there are no participations', () => {
    expect(hasOpenMineEvents([])).toBe(false)
  })
})

describe('hasOpenMineShifts', () => {
  const today = '2026-08-11'

  it('is true when an editable shift is missing odometers', () => {
    expect(
      hasOpenMineShifts(
        [
          {
            shift_date: '2026-08-11',
            odometer_start: null,
            odometer_end: null,
          },
        ],
        today,
      ),
    ).toBe(true)
  })

  it('is true when only one odometer is filled', () => {
    expect(
      hasOpenMineShifts(
        [
          {
            shift_date: '2026-08-10',
            odometer_start: 100,
            odometer_end: null,
          },
        ],
        today,
      ),
    ).toBe(true)
  })

  it('is false when the shift is already closed', () => {
    expect(
      hasOpenMineShifts(
        [
          {
            shift_date: '2026-08-10',
            status: 'closed',
            odometer_start: 100,
            odometer_end: 150,
          },
        ],
        today,
      ),
    ).toBe(false)
  })

  it('stays open when odometers are in but the status is still a draft', () => {
    expect(
      hasOpenMineShifts(
        [
          {
            shift_date: '2026-08-10',
            status: 'draft',
            odometer_start: 100,
            odometer_end: 150,
          },
        ],
        today,
      ),
    ).toBe(true)
  })

  it('ignores future shifts even without odometers', () => {
    expect(
      hasOpenMineShifts(
        [
          {
            shift_date: '2026-08-12',
            odometer_start: null,
            odometer_end: null,
          },
        ],
        today,
      ),
    ).toBe(false)
  })

  it('is false when there are no shifts', () => {
    expect(hasOpenMineShifts([], today)).toBe(false)
  })
})

describe('navAttentionAriaSuffix', () => {
  it('returns Hebrew hint when attention is needed', () => {
    expect(navAttentionAriaSuffix(true)).toBe(' — יש פריטים להשלמה')
  })

  it('returns empty when no attention', () => {
    expect(navAttentionAriaSuffix(false)).toBe('')
  })
})
