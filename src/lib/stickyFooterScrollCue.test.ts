import { describe, expect, it } from 'vitest'
import {
  contentOverflowsScrollport,
  findScrollportAncestor,
} from './stickyFooterScrollCue'

describe('contentOverflowsScrollport', () => {
  it('is false when content fits exactly', () => {
    expect(contentOverflowsScrollport(800, 800)).toBe(false)
  })

  it('is false when content is shorter than the scrollport', () => {
    expect(contentOverflowsScrollport(600, 800)).toBe(false)
  })

  it('is true when content is taller than the scrollport', () => {
    expect(contentOverflowsScrollport(1200, 800)).toBe(true)
  })
})

describe('findScrollportAncestor', () => {
  it('returns the nearest ancestor with overflow-y auto/scroll', () => {
    const chain = [
      { overflowY: 'visible' },
      { overflowY: 'auto' },
      { overflowY: 'visible' },
    ]
    expect(findScrollportAncestor(chain)).toEqual({ overflowY: 'auto' })
  })

  it('prefers the nearest scroll ancestor over a farther one', () => {
    const near = { overflowY: 'scroll' }
    const far = { overflowY: 'auto' }
    expect(findScrollportAncestor([{ overflowY: 'visible' }, near, far])).toBe(near)
  })

  it('returns null when no scroll ancestor exists', () => {
    expect(
      findScrollportAncestor([{ overflowY: 'visible' }, { overflowY: 'hidden' }]),
    ).toBeNull()
  })
})
