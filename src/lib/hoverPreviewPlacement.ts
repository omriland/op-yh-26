export type PlacementRect = { top: number; bottom: number; left: number; right: number }
export type PlacementSize = { width: number; height: number }

type PlacementInput = {
  anchor: PlacementRect
  card: PlacementSize
  viewport: PlacementSize
  direction: 'rtl' | 'ltr'
  /** Horizontal pointer position. Without it (keyboard focus) the row's edge is used. */
  pointerX?: number
  gap?: number
  edgePadding?: number
  pointerOffset?: number
}

export type PlacedCard = { top: number; left: number; maxHeight: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Vertical spot that never overlaps the row: below it, else above it, else the
 * larger side with the card height capped to that space.
 */
function placeVertically(
  anchor: PlacementRect,
  cardHeight: number,
  viewportHeight: number,
  gap: number,
  edgePadding: number,
): { top: number; maxHeight: number } {
  const spaceBelow = viewportHeight - edgePadding - (anchor.bottom + gap)
  const spaceAbove = anchor.top - gap - edgePadding
  if (cardHeight <= spaceBelow) return { top: anchor.bottom + gap, maxHeight: spaceBelow }
  if (cardHeight <= spaceAbove) {
    return { top: anchor.top - gap - cardHeight, maxHeight: spaceAbove }
  }
  if (spaceBelow >= spaceAbove) return { top: anchor.bottom + gap, maxHeight: spaceBelow }
  const cappedHeight = Math.min(cardHeight, spaceAbove)
  return { top: anchor.top - gap - cappedHeight, maxHeight: spaceAbove }
}

/**
 * Horizontal spot beside the pointer, not under it, so sweeping the pointer
 * straight down the table never lands on the card. Prefers the reading-end
 * side of the pointer and flips to the other side when that side is too tight.
 */
function placeHorizontally({
  anchor,
  cardWidth,
  viewportWidth,
  direction,
  pointerX,
  pointerOffset,
  edgePadding,
}: {
  anchor: PlacementRect
  cardWidth: number
  viewportWidth: number
  direction: 'rtl' | 'ltr'
  pointerX: number | undefined
  pointerOffset: number
  edgePadding: number
}): number {
  const maxLeft = viewportWidth - cardWidth - edgePadding
  if (pointerX === undefined) {
    const rowStart = direction === 'rtl' ? anchor.right - cardWidth : anchor.left
    return clamp(rowStart, edgePadding, maxLeft)
  }
  const leftOfPointer = pointerX - pointerOffset - cardWidth
  const rightOfPointer = pointerX + pointerOffset
  const endSideFirst = direction === 'rtl' ? [leftOfPointer, rightOfPointer] : [rightOfPointer, leftOfPointer]
  const fitting = endSideFirst.find((left) => left >= edgePadding && left <= maxLeft)
  return fitting ?? clamp(endSideFirst[0], edgePadding, maxLeft)
}

/**
 * Puts the card clear of the hovered row, so the row stays clickable, and
 * beside the pointer, so the rows below it stay reachable. Always inside the
 * viewport; `maxHeight` is the room the card may use.
 */
export function placePreviewCard({
  anchor,
  card,
  viewport,
  direction,
  pointerX,
  gap = 4,
  edgePadding = 8,
  pointerOffset = 24,
}: PlacementInput): PlacedCard {
  const vertical = placeVertically(anchor, card.height, viewport.height, gap, edgePadding)
  const left = placeHorizontally({
    anchor,
    cardWidth: card.width,
    viewportWidth: viewport.width,
    direction,
    pointerX,
    pointerOffset,
    edgePadding,
  })
  return { ...vertical, left }
}
