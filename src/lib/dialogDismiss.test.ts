import { describe, expect, it } from 'vitest'
import { escapeBelongsToPopup, shouldDismissDialogBackdrop } from './dialogDismiss'

describe('escapeBelongsToPopup', () => {
  const inside = (match: boolean) => ({ closest: (selector: string) => (match ? { selector } : null) })

  it('leaves Escape to an open SelectField menu inside the dialog', () => {
    expect(escapeBelongsToPopup(inside(true) as unknown as EventTarget)).toBe(true)
  })

  it('lets the dialog close when no menu is open', () => {
    expect(escapeBelongsToPopup(inside(false) as unknown as EventTarget)).toBe(false)
    expect(escapeBelongsToPopup(null)).toBe(false)
    expect(escapeBelongsToPopup({} as EventTarget)).toBe(false)
  })

  it('checks the selectors SelectField renders while open', () => {
    let asked = ''
    escapeBelongsToPopup({
      closest: (selector: string) => {
        asked = selector
        return null
      },
    } as unknown as EventTarget)
    for (const part of ['[role="listbox"]', '.select-field__menu', '[aria-expanded="true"]']) {
      expect(asked).toContain(part)
    }
  })
})

const press = {
  pointerDownOnBackdrop: true,
  clickTargetIsBackdrop: true,
  documentVisible: true,
  millisSinceWindowFocus: 5_000,
}

describe('shouldDismissDialogBackdrop', () => {
  it('dismisses a press that starts and ends on the backdrop after the window is focused', () => {
    expect(shouldDismissDialogBackdrop(press)).toBe(true)
  })

  it('does not dismiss while the document is hidden', () => {
    expect(shouldDismissDialogBackdrop({ ...press, documentVisible: false })).toBe(false)
  })

  it('does not dismiss the click that arrives with the window regaining focus', () => {
    expect(shouldDismissDialogBackdrop({ ...press, millisSinceWindowFocus: 0 })).toBe(false)
    expect(shouldDismissDialogBackdrop({ ...press, millisSinceWindowFocus: 499 })).toBe(false)
    expect(shouldDismissDialogBackdrop({ ...press, millisSinceWindowFocus: 500 })).toBe(true)
  })

  it('does not dismiss when the press started inside the dialog', () => {
    expect(shouldDismissDialogBackdrop({ ...press, pointerDownOnBackdrop: false })).toBe(false)
  })

  it('does not dismiss a click that landed inside the dialog', () => {
    expect(shouldDismissDialogBackdrop({ ...press, clickTargetIsBackdrop: false })).toBe(false)
  })
})
