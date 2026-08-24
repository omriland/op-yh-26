import { describe, expect, it, vi } from 'vitest'
import { INVALID_SELECTOR, focusFirstInvalid } from './revealFirstError'

function target() {
  return { focus: vi.fn(), scrollIntoView: vi.fn() }
}

describe('focusFirstInvalid', () => {
  it('focuses and scrolls the first invalid control', () => {
    const first = target()
    const root = { querySelector: vi.fn(() => first) }
    expect(focusFirstInvalid(root)).toBe(true)
    expect(root.querySelector).toHaveBeenCalledWith(INVALID_SELECTOR)
    expect(first.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(first.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
  })

  it('focuses before scrolling, so the browser jump does not fight the animation', () => {
    const order: string[] = []
    const first = {
      focus: () => void order.push('focus'),
      scrollIntoView: () => void order.push('scroll'),
    }
    focusFirstInvalid({ querySelector: () => first })
    expect(order).toEqual(['focus', 'scroll'])
  })

  it('reports false when nothing is invalid', () => {
    expect(focusFirstInvalid({ querySelector: () => null })).toBe(false)
  })

  it('queries only the documented invalid selector', () => {
    expect(INVALID_SELECTOR).toBe('[aria-invalid="true"]')
  })
})
