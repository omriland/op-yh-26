import { describe, expect, it, vi } from 'vitest'
import {
  APP_HEIGHT_VAR,
  KEYBOARD_OPEN_ATTR,
  applyAppViewportHeight,
  applyKeyboardOpenState,
  bindAppViewportHeight,
  isVirtualKeyboardOpen,
  readAppViewportHeight,
  resetDocumentScroll,
  shouldScrollFocusedField,
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

describe('isVirtualKeyboardOpen', () => {
  it('is false until the visual viewport drops by the keyboard threshold', () => {
    expect(isVirtualKeyboardOpen(640, 700)).toBe(false)
    expect(isVirtualKeyboardOpen(520, 700)).toBe(true)
  })

  it('is false when resting height is still unknown', () => {
    expect(isVirtualKeyboardOpen(700, 0)).toBe(false)
  })
})

describe('applyKeyboardOpenState', () => {
  it('toggles the html data attribute', () => {
    const attrs = new Map<string, string>()
    const root = {
      setAttribute: (name: string, value: string) => {
        attrs.set(name, value)
      },
      removeAttribute: (name: string) => {
        attrs.delete(name)
      },
    }

    applyKeyboardOpenState(true, root)
    expect(attrs.get(KEYBOARD_OPEN_ATTR)).toBe('')
    applyKeyboardOpenState(false, root)
    expect(attrs.has(KEYBOARD_OPEN_ATTR)).toBe(false)
  })
})

describe('shouldScrollFocusedField', () => {
  it('is true for text fields and false for the document body', () => {
    expect(shouldScrollFocusedField({ tagName: 'INPUT', isContentEditable: false })).toBe(true)
    expect(shouldScrollFocusedField({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true)
    expect(shouldScrollFocusedField({ tagName: 'SELECT', isContentEditable: false })).toBe(true)
    expect(shouldScrollFocusedField({ tagName: 'BODY', isContentEditable: false })).toBe(false)
    expect(shouldScrollFocusedField(null)).toBe(false)
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
      applyKeyboardOpen: () => {},
      scrollFocusedField: () => {},
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

  it('marks the document keyboard-open when the visual viewport shrinks', () => {
    let visualHeight = 700
    const applyKeyboardOpen = vi.fn()
    const vvListeners = new Map<string, () => void>()

    bindAppViewportHeight({
      getVisualHeight: () => visualHeight,
      getLayoutHeight: () => 700,
      applyHeight: () => {},
      resetScroll: () => {},
      applyKeyboardOpen,
      scrollFocusedField: () => {},
      addWindowListener: () => () => {},
      addVisualViewportListener: (type, listener) => {
        vvListeners.set(type, listener)
        return () => vvListeners.delete(type)
      },
    })

    expect(applyKeyboardOpen).toHaveBeenCalledWith(false)

    applyKeyboardOpen.mockClear()
    visualHeight = 420
    vvListeners.get('resize')?.()
    expect(applyKeyboardOpen).toHaveBeenCalledWith(true)

    applyKeyboardOpen.mockClear()
    visualHeight = 700
    vvListeners.get('resize')?.()
    expect(applyKeyboardOpen).toHaveBeenCalledWith(false)
  })
})
