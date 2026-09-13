import { describe, expect, it } from 'vitest'
import { placeSelectMenu, SELECT_MENU_MIN_WIDTH } from './selectMenuPlacement'

const pad = 8
const gap = 4

describe('placeSelectMenu', () => {
  it('matches the trigger width on a wide desktop field', () => {
    const result = placeSelectMenu({
      trigger: { top: 80, bottom: 124, left: 400, right: 720 },
      viewport: { width: 1280, height: 800 },
      searchable: true,
      rtl: true,
    })

    expect(result.width).toBe(320)
    expect(result.left).toBe(400)
    expect(result.top).toBe(128)
  })

  it('widens a compact non-searchable menu so Hebrew option labels are not clipped', () => {
    const result = placeSelectMenu({
      trigger: { top: 80, bottom: 124, left: 1100, right: 1220 },
      viewport: { width: 1280, height: 800 },
      searchable: false,
      rtl: true,
    })

    expect(result.width).toBe(SELECT_MENU_MIN_WIDTH)
    expect(result.left).toBe(1220 - SELECT_MENU_MIN_WIDTH)
    expect(result.left + result.width).toBe(1220)
  })

  it('leaves a wide non-searchable field menu at the trigger width', () => {
    const result = placeSelectMenu({
      trigger: { top: 80, bottom: 124, left: 200, right: 560 },
      viewport: { width: 1280, height: 800 },
      searchable: false,
      rtl: true,
    })

    expect(result.width).toBe(360)
    expect(result.left).toBe(200)
  })

  it('widens a searchable menu on a narrow mobile column and keeps it on screen', () => {
    const result = placeSelectMenu({
      trigger: { top: 220, bottom: 264, left: 200, right: 374 },
      viewport: { width: 390, height: 720 },
      searchable: true,
      rtl: true,
    })

    expect(result.width).toBeGreaterThan(174)
    expect(result.left).toBeGreaterThanOrEqual(pad)
    expect(result.left + result.width).toBeLessThanOrEqual(390 - pad)
    expect(result.top).toBe(268)
  })

  it('converts layout-viewport rects into visual-viewport fixed coordinates', () => {
    const result = placeSelectMenu({
      trigger: { top: 300, bottom: 344, left: 40, right: 360 },
      viewport: { width: 390, height: 400, offsetLeft: 0, offsetTop: 220 },
      searchable: true,
      rtl: true,
    })

    expect(result.top).toBe(344 - 220 + gap)
    expect(result.left).toBeGreaterThanOrEqual(pad)
    expect(result.left + result.width).toBeLessThanOrEqual(390 - pad)
    expect(result.maxHeight).toBeLessThanOrEqual(400 - result.top - pad)
  })
})
