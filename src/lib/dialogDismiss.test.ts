import { describe, expect, it } from 'vitest'
import { shouldDismissDialogBackdrop } from './dialogDismiss'

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
