import { describe, expect, it } from 'vitest'
import { placeOverflowMenuPanel } from './overflowMenuPlacement'

const minWidth = 180

describe('placeOverflowMenuPanel', () => {
  it('opens below the trigger when the full panel fits', () => {
    const result = placeOverflowMenuPanel({
      trigger: { top: 80, bottom: 124, right: 800 },
      viewport: { width: 1280, height: 800 },
      panelHeight: 200,
      minWidth,
    })

    expect(result.top).toBe(128)
    expect(result.maxHeight).toBe(200)
    expect(result.left).toBe(620)
  })

  it('caps height to remaining viewport so a long menu can scroll', () => {
    const result = placeOverflowMenuPanel({
      trigger: { top: 80, bottom: 124, right: 800 },
      viewport: { width: 1280, height: 800 },
      panelHeight: 700,
      minWidth,
    })

    expect(result.top).toBe(128)
    expect(result.maxHeight).toBe(664)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(792)
  })

  it('opens upward when there is more room above a tall panel', () => {
    const result = placeOverflowMenuPanel({
      trigger: { top: 656, bottom: 700, right: 800 },
      viewport: { width: 1280, height: 800 },
      panelHeight: 440,
      minWidth,
    })

    expect(result.maxHeight).toBe(440)
    expect(result.top).toBe(212)
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(656)
    expect(result.top).toBeGreaterThanOrEqual(8)
  })
})
