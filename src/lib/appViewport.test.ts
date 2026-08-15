import { describe, expect, it, vi } from 'vitest'
import {
  APP_HEIGHT_VAR,
  applyAppViewportHeight,
  bindAppViewportHeight,
  readAppViewportHeight,
  resetDocumentScroll,
} from './appViewport'

describe('readAppViewportHeight', () => {
  it('prefers the visual viewport height when present', () => {
    expect(readAppViewportHeight(640.4, 800)).toBe(640)
  })

  it('falls back to the layout viewport height', () => {
    expect(readAppViewportHeight(undefined, 812)).toBe(812)
  })

  it('never returns zero or negative', () => {
    expect(readAppViewportHeight(0, 0)).toBe(1)
    expect(readAppViewportHeight(-20, 100)).toBe(1)
  })
})

describe('applyAppViewportHeight', () => {
  it('writes the CSS custom property in pixels', () => {
    const setProperty = vi.fn()
    applyAppViewportHeight(700, { style: { setProperty } })
    expect(setProperty).toHaveBeenCalledWith(APP_HEIGHT_VAR, '700px')
  })
})

describe('resetDocumentScroll', () => {
  it('scrolls to origin when the document has moved', () => {
    const scrollToFn = vi.fn()
    resetDocumentScroll(scrollToFn, () => 0, () => 48)
    expect(scrollToFn).toHaveBeenCalledWith(0, 0)
  })

  it('does nothing when already at origin', () => {
    const scrollToFn = vi.fn()
    resetDocumentScroll(scrollToFn, () => 0, () => 0)
    expect(scrollToFn).not.toHaveBeenCalled()
  })
})

describe('bindAppViewportHeight', () => {
  it('applies height immediately and on window / visualViewport events', () => {
    const applyHeight = vi.fn()
    const resetScroll = vi.fn()
    const windowListeners = new Map<string, () => void>()
    const vvListeners = new Map<string, () => void>()

    const unbind = bindAppViewportHeight({
      getVisualHeight: () => 667,
      getLayoutHeight: () => 800,
      applyHeight,
      resetScroll,
      addWindowListener: (type, listener) => {
        windowListeners.set(type, listener)
        return () => windowListeners.delete(type)
      },
      addVisualViewportListener: (type, listener) => {
        vvListeners.set(type, listener)
        return () => vvListeners.delete(type)
      },
    })

    expect(applyHeight).toHaveBeenCalledWith(667)
    expect(resetScroll).toHaveBeenCalled()

    applyHeight.mockClear()
    windowListeners.get('resize')?.()
    expect(applyHeight).toHaveBeenCalledWith(667)

    applyHeight.mockClear()
    vvListeners.get('resize')?.()
    expect(applyHeight).toHaveBeenCalledWith(667)

    unbind()
    expect(windowListeners.size).toBe(0)
    expect(vvListeners.size).toBe(0)
  })
})
