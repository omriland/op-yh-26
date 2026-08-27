import { describe, expect, it } from 'vitest'
import { placeAvailabilityPopover } from './availabilityPopoverPlacement'

const panel = { width: 280, height: 220 }
const pad = 8
const gap = 4

describe('placeAvailabilityPopover', () => {
  it('opens below the trigger when the full panel fits', () => {
    const result = placeAvailabilityPopover({
      trigger: { top: 80, bottom: 120, left: 16, right: 200 },
      viewport: { width: 1280, height: 800 },
      panel,
      rtl: true,
    })

    expect(result.top).toBe(124)
    expect(result.maxHeight).toBe(220)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(800 - pad)
  })

  it('opens above a bottom-of-sidebar trigger so the panel stays on screen', () => {
    const result = placeAvailabilityPopover({
      trigger: { top: 740, bottom: 784, left: 1000, right: 1264 },
      viewport: { width: 1280, height: 800 },
      panel,
      rtl: true,
    })

    expect(result.top).toBe(740 - gap - 220)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(740)
    expect(result.top).toBeGreaterThanOrEqual(pad)
  })

  it('keeps an RTL sidebar popover inside the viewport instead of growing off the inline-start edge', () => {
    const result = placeAvailabilityPopover({
      trigger: { top: 740, bottom: 784, left: 1040, right: 1264 },
      viewport: { width: 1280, height: 800 },
      panel,
      rtl: true,
    })

    expect(result.left).toBeGreaterThanOrEqual(pad)
    expect(result.left + panel.width).toBeLessThanOrEqual(1280 - pad)
  })

  it('caps height when neither side has room for the full panel', () => {
    const result = placeAvailabilityPopover({
      trigger: { top: 400, bottom: 440, left: 16, right: 200 },
      viewport: { width: 1280, height: 480 },
      panel: { width: 280, height: 500 },
      rtl: false,
    })

    expect(result.maxHeight).toBeLessThan(500)
    expect(result.top).toBeGreaterThanOrEqual(pad)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(480 - pad)
  })
})
