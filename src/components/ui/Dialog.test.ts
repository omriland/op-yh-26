import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './Dialog.tsx'), 'utf8')

describe('Dialog portal', () => {
  it('renders on document.body so appbar stacking cannot trap it under the tab bar', () => {
    expect(src).toContain("from 'react-dom'")
    expect(src).toContain('createPortal')
    expect(src).toContain('document.body')
  })
})

describe('Dialog keyboard lift', () => {
  it('listens to the visual viewport and focus so a phone sheet clears the keyboard', () => {
    expect(src).toContain('window.visualViewport')
    expect(src).toContain("vv.addEventListener('resize', placeAndReveal)")
    expect(src).toContain("vv.addEventListener('scroll', place)")
    expect(src).toContain("sheet.addEventListener('focusin', onFocusIn)")
    expect(src).toContain('sheetAboveKeyboard')
    expect(src).toContain('if (!open || isDesktop) return')
    expect(src).toContain("root.style.bottom = ''")
    expect(src).toContain("sheet.style.maxHeight = ''")
  })

  it('does not scroll the focused field on a visual viewport scroll', () => {
    // scrollIntoView pans the viewport, which fires another scroll: a flicker loop on iOS.
    expect(src).not.toContain("vv.addEventListener('scroll', placeAndReveal)")
    const start = src.indexOf('const place = () => {')
    const place = src.slice(start, src.indexOf('\n    }\n', start))
    expect(place).not.toContain('scrollIntoView')
  })
})

describe('Dialog focus trap', () => {
  it('does not re-run initial focus when parent re-renders with a new onClose', () => {
    // Typing in a form dialog (e.g. משתמש חדש) recreates an inline onClose every
    // keystroke. If that identity is in the trap effect deps, focus jumps to X.
    expect(src).toContain('onCloseRef.current = onClose')
    expect(src).toMatch(/addEventListener\('keydown', onKeyDown, true\)[\s\S]*?\n  \}, \[open\]\)/)
    expect(src).not.toMatch(/\}, \[open, onClose\]\)/)
  })
})
