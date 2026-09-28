import { describe, expect, it } from 'vitest'
import {
  hasOpenMineEvents,
  hasOpenMineShifts,
  navAttentionAriaSuffix,
} from './navAttention'

const openManual = {
  origin: 'manual' as const,
  policeEventId: '12345',
  patrolCallsignNumber: '411',
  roadId: 'road-1',
}

describe('hasOpenMineEvents', () => {
  it('is true when any own participation is not done', () => {
    expect(
      hasOpenMineEvents([
        { status: 'done', ...openManual, policeEventId: '1' },
        { status: 'pending', ...openManual, policeEventId: '2' },
      ]),
    ).toBe(true)
  })

  it('is true for in_progress', () => {
    expect(hasOpenMineEvents([{ status: 'in_progress', ...openManual }])).toBe(true)
  })

  it('is false when every participation is done', () => {
    expect(hasOpenMineEvents([{ status: 'done' }, { status: 'done' }])).toBe(false)
  })

  it('is false when there are no participations', () => {
    expect(hasOpenMineEvents([])).toBe(false)
  })

  it('ignores a manual assignment until או״ק, כביש, and מספר אירוע are filled', () => {
    expect(
      hasOpenMineEvents([
        { status: 'pending', origin: 'manual', policeEventId: null, patrolCallsignNumber: '411', roadId: 'r' },
      ]),
    ).toBe(false)
    expect(
      hasOpenMineEvents([
        { status: 'pending', ...openManual, patrolCallsignNumber: '' },
      ]),
    ).toBe(false)
    expect(
      hasOpenMineEvents([
        { status: 'pending', ...openManual, roadId: '' },
      ]),
    ).toBe(false)
    expect(
      hasOpenMineEvents([
        { status: 'pending', ...openManual },
      ]),
    ).toBe(true)
    expect(
      hasOpenMineEvents([
        { status: 'pending', origin: 'shift', policeEventId: null },
      ]),
    ).toBe(true)
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
