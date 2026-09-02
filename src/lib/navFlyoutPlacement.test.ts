import { describe, expect, it } from 'vitest'
import { placeNavFlyout } from './navFlyoutPlacement'

describe('placeNavFlyout', () => {
  it('opens toward the content in RTL so the sidebar does not clip it', () => {
    const placed = placeNavFlyout({
      trigger: { top: 200, left: 800, right: 1040 },
      panelWidth: 180,
      viewport: { width: 1280, height: 800 },
      rtl: true,
    })
    expect(placed.left).toBe(800 - 180 - 4)
    expect(placed.top).toBe(200)
  })

  it('stays inside the viewport when the panel would overflow', () => {
    const placed = placeNavFlyout({
      trigger: { top: 12, left: 40, right: 80 },
      panelWidth: 180,
      viewport: { width: 200, height: 400 },
      rtl: true,
    })
    expect(placed.left).toBe(8)
    expect(placed.top).toBe(12)
  })
})
