import { describe, expect, it } from 'vitest'
import { responderCardStartsOpen, responderCardShowsOdometers } from './responderCard'

describe('responderCardStartsOpen', () => {
  it('opens only the viewer’s own card when they are a responder', () => {
    expect(responderCardStartsOpen({ isViewer: true, manages: false })).toBe(true)
    expect(responderCardStartsOpen({ isViewer: false, manages: false })).toBe(false)
  })

  it('keeps every card collapsed for אחמ״ש and מנהל', () => {
    expect(responderCardStartsOpen({ isViewer: true, manages: true })).toBe(false)
    expect(responderCardStartsOpen({ isViewer: false, manages: true })).toBe(false)
  })
})

describe('responderCardShowsOdometers', () => {
  it('lets a כונן see מד אוץ on their own card only', () => {
    expect(responderCardShowsOdometers({ isViewer: true, manages: false })).toBe(true)
    expect(responderCardShowsOdometers({ isViewer: false, manages: false })).toBe(false)
  })

  it('lets אחמ״ש and מנהל see מד אוץ on every card', () => {
    expect(responderCardShowsOdometers({ isViewer: true, manages: true })).toBe(true)
    expect(responderCardShowsOdometers({ isViewer: false, manages: true })).toBe(true)
  })
})
