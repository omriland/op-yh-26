import { describe, expect, it } from 'vitest'
import { isMapPinHoverTarget } from './policeStationsMap'

describe('isMapPinHoverTarget', () => {
  it('treats the pin and its children as the responder tooltip owner', () => {
    expect(
      isMapPinHoverTarget({
        closest: (selector: string) => (selector === '.user-map-pin' ? {} : null),
      } as unknown as EventTarget),
    ).toBe(true)
  })

  it('does not treat the map canvas as a pin', () => {
    expect(
      isMapPinHoverTarget({
        closest: () => null,
      } as unknown as EventTarget),
    ).toBe(false)
    expect(isMapPinHoverTarget(null)).toBe(false)
  })
})
