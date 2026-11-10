import { describe, expect, it, vi } from 'vitest'
import {
  APP_HEIGHT_VAR,
  KEYBOARD_OPEN_ATTR,
  applyAppViewportHeight,
  applyKeyboardOpenState,
  bindAppViewportHeight,
  isVirtualKeyboardOpen,
  keyboardCoverPx,
  readAppViewportHeight,
  resetDocumentScroll,
  sheetAboveKeyboard,
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

describe('keyboardCoverPx', () => {
  it('is the layout viewport hidden below the visual viewport', () => {
    expect(keyboardCoverPx(800, 0, 420)).toBe(380)
    expect(keyboardCoverPx(800, 40, 420)).toBe(340)
  })

  it('stays closed for browser chrome and a resting viewport', () => {
    expect(keyboardCoverPx(800, 0, 720)).toBe(0)
    expect(keyboardCoverPx(800, 0, 800)).toBe(0)
    expect(keyboardCoverPx(700, 0, 760)).toBe(0)
  })
})

describe('sheetAboveKeyboard', () => {
  it('lifts the fixed sheet by the keyboard overlap and caps it to the visual viewport', () => {
    expect(sheetAboveKeyboard(800, 0, 420)).toEqual({
      rootBottom: '380px',
      sheetMaxHeight: '420px',
    })
  })

  it('clears the lift after the keyboard closes', () => {
    expect(sheetAboveKeyboard(800, 0, 800)).toEqual({
      rootBottom: '',
      sheetMaxHeight: '',
    })
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

  it('does not re-scroll the field on a viewport scroll while the keyboard is open', () => {
    // iOS: scrollIntoView pans the visual viewport, the pan fires a scroll event,
    // resetScroll pans back and fires another. Revealing on every scroll looped
    // and flickered the new-event KM field.
    let visualHeight = 700
    const vvListeners = new Map<string, () => void>()
    let reveals = 0
    const scrollFocusedField = () => {
      reveals += 1
      if (reveals < 20) vvListeners.get('scroll')?.()
    }

    bindAppViewportHeight({
      getVisualHeight: () => visualHeight,
      getLayoutHeight: () => 700,
      applyHeight: () => {},
      resetScroll: () => {},
      applyKeyboardOpen: () => {},
      scrollFocusedField,
      addWindowListener: () => () => {},
      addVisualViewportListener: (type, listener) => {
        vvListeners.set(type, listener)
        return () => vvListeners.delete(type)
      },
    })
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb())
    try {
      visualHeight = 420
      vvListeners.get('resize')?.()
      expect(reveals).toBe(1)

      vvListeners.get('scroll')?.()
      expect(reveals).toBe(1)

      visualHeight = 380
      vvListeners.get('resize')?.()
      expect(reveals).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
