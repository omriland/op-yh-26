import { describe, expect, it } from 'vitest'
import { placePreviewCard, type PlacementRect } from './hoverPreviewPlacement'

const viewport = { width: 1280, height: 800 }
const card = { width: 360, height: 300 }

function rowAt(top: number): PlacementRect {
  return { top, bottom: top + 48, left: 200, right: 1000 }
}

function overlapsVertically(placed: { top: number; maxHeight: number }, height: number, row: PlacementRect) {
  const cardBottom = placed.top + Math.min(height, placed.maxHeight)
  return placed.top < row.bottom && cardBottom > row.top
}

describe('placePreviewCard', () => {
  it('sits below the row, beside the pointer on the reading-end side in right-to-left', () => {
    const place = placePreviewCard({ anchor: rowAt(100), card, viewport, direction: 'rtl', pointerX: 700 })

    expect(place.top).toBe(152)
    expect(place.left).toBe(700 - 24 - 360)
  })

  it('goes to the right of the pointer in left-to-right', () => {
    const place = placePreviewCard({ anchor: rowAt(100), card, viewport, direction: 'ltr', pointerX: 400 })

    expect(place.left).toBe(424)
  })

  it('flips to the other side of the pointer when the first side is too tight', () => {
    const place = placePreviewCard({ anchor: rowAt(100), card, viewport, direction: 'rtl', pointerX: 200 })

    expect(place.left).toBe(224)
  })

  it('never sits under the pointer', () => {
    const pointerX = 640
    const place = placePreviewCard({ anchor: rowAt(100), card, viewport, direction: 'rtl', pointerX })

    const coversPointer = place.left <= pointerX && pointerX <= place.left + card.width
    expect(coversPointer).toBe(false)
  })

  it('lines up with the row edge when there is no pointer (keyboard focus)', () => {
    const rtl = placePreviewCard({ anchor: rowAt(100), card, viewport, direction: 'rtl' })
    const ltr = placePreviewCard({ anchor: rowAt(100), card, viewport, direction: 'ltr' })

    expect(rtl.left).toBe(640)
    expect(ltr.left).toBe(200)
  })

  it('moves above the row when there is no room below', () => {
    const place = placePreviewCard({ anchor: rowAt(600), card, viewport, direction: 'rtl' })

    expect(place.top).toBe(600 - 4 - 300)
  })

  it('uses the larger side and caps the height when the card fits neither side', () => {
    const row = rowAt(300)
    const tall = { width: 360, height: 480 }
    const place = placePreviewCard({ anchor: row, card: tall, viewport: { width: 1280, height: 768 }, direction: 'rtl' })

    expect(place.maxHeight).toBeLessThan(tall.height)
    expect(overlapsVertically(place, tall.height, row)).toBe(false)
    expect(place.top).toBeGreaterThanOrEqual(8)
  })

  it('does not overlap the row on a short viewport for any row position', () => {
    const tall = { width: 360, height: 480 }
    const shortViewport = { width: 1280, height: 600 }
    for (let top = 0; top <= 550; top += 25) {
      const row = rowAt(top)
      const place = placePreviewCard({ anchor: row, card: tall, viewport: shortViewport, direction: 'rtl', pointerX: 600 })

      expect(overlapsVertically(place, tall.height, row)).toBe(false)
    }
  })

  it('is pulled back inside the viewport horizontally', () => {
    const wideRow = { top: 100, bottom: 148, left: -50, right: 200 }
    const place = placePreviewCard({ anchor: wideRow, card, viewport, direction: 'rtl' })

    expect(place.left).toBe(8)
  })
})
