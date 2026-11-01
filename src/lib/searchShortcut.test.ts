import { describe, expect, it } from 'vitest'
import { isSearchShortcut } from './searchShortcut'

const base = {
  key: 'k',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
}

describe('isSearchShortcut', () => {
  it('accepts Cmd+K and Ctrl+K', () => {
    expect(isSearchShortcut({ ...base, metaKey: true })).toBe(true)
    expect(isSearchShortcut({ ...base, ctrlKey: true })).toBe(true)
    expect(isSearchShortcut({ ...base, ctrlKey: true, key: 'K' })).toBe(true)
  })

  it('accepts the Hebrew layout K key', () => {
    expect(isSearchShortcut({ ...base, metaKey: true, key: 'ל' })).toBe(true)
  })

  it('rejects a bare K, other keys, Alt, Shift and composition', () => {
    expect(isSearchShortcut(base)).toBe(false)
    expect(isSearchShortcut({ ...base, metaKey: true, key: 'j' })).toBe(false)
    expect(isSearchShortcut({ ...base, metaKey: true, altKey: true })).toBe(false)
    expect(isSearchShortcut({ ...base, metaKey: true, shiftKey: true })).toBe(false)
    expect(isSearchShortcut({ ...base, metaKey: true, isComposing: true })).toBe(false)
  })
})
