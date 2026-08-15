import { describe, expect, it } from 'vitest'
import { applyNavClick } from './navReset'

describe('applyNavClick', () => {
  it('returns the section root even when the same nav item is already current', () => {
    const next = applyNavClick(
      {
        view: 'reports',
        eventSurface: { kind: 'detail', eventId: 'e1' },
        shiftSurface: { kind: 'detail', shiftId: 's1' },
        sectionReset: 3,
      },
      'reports',
    )

    expect(next).toEqual({
      view: 'reports',
      eventSurface: { kind: 'list' },
      shiftSurface: { kind: 'list' },
      sectionReset: 4,
    })
  })

  it('still remounts the destination when switching sections', () => {
    const next = applyNavClick(
      {
        view: 'fuel_quarter',
        eventSurface: { kind: 'list' },
        shiftSurface: { kind: 'list' },
        sectionReset: 0,
      },
      'events',
    )

    expect(next.view).toBe('events')
    expect(next.sectionReset).toBe(1)
  })
})
