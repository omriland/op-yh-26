import { describe, expect, it } from 'vitest'
import { opsMapViewTrigger, shouldRefitOpsMapView } from './opsMapView'

describe('opsMapViewTrigger', () => {
  it('uses init until the first camera apply', () => {
    expect(
      opsMapViewTrigger({ initialized: false, originChanged: false, focusChanged: false }),
    ).toBe('init')
  })

  it('treats a new search origin as search even if pins also changed', () => {
    expect(
      opsMapViewTrigger({ initialized: true, originChanged: true, focusChanged: false }),
    ).toBe('search')
  })

  it('treats a nearby-responder focus as focus', () => {
    expect(
      opsMapViewTrigger({ initialized: true, originChanged: false, focusChanged: true }),
    ).toBe('focus')
  })

  it('treats pin refreshes as data', () => {
    expect(
      opsMapViewTrigger({ initialized: true, originChanged: false, focusChanged: false }),
    ).toBe('data')
  })
})

describe('shouldRefitOpsMapView', () => {
  it('always fits on first load, search, and focus', () => {
    expect(shouldRefitOpsMapView('init', true)).toBe(true)
    expect(shouldRefitOpsMapView('search', true)).toBe(true)
    expect(shouldRefitOpsMapView('focus', true)).toBe(true)
  })

  it('keeps the dragged zoom and pan when live pins or addresses refresh', () => {
    expect(shouldRefitOpsMapView('data', true)).toBe(false)
  })

  it('still fits pin data before the user has moved the map', () => {
    expect(shouldRefitOpsMapView('data', false)).toBe(true)
  })
})
