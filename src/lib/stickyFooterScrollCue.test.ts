import { describe, expect, it } from 'vitest'
import { contentOverflowsScrollport } from './stickyFooterScrollCue'

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
