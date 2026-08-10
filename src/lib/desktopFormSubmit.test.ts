import { describe, expect, it } from 'vitest'
import {
  isApplePlatform,
  isDesktopSubmitShortcut,
  isBlockedByForeignModal,
  submitShortcutKeys,
} from './desktopFormSubmit'

describe('isApplePlatform', () => {
  it('detects Mac via platform', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true)
  })

  it('detects non-Apple via platform', () => {
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Windows' })).toBe(false)
  })
})

describe('isDesktopSubmitShortcut', () => {
  it('accepts Meta+Enter on Apple', () => {
    expect(
      isDesktopSubmitShortcut(
        { key: 'Enter', metaKey: true, ctrlKey: false },
        { apple: true },
      ),
    ).toBe(true)
  })

  it('rejects Ctrl+Enter on Apple', () => {
    expect(
      isDesktopSubmitShortcut(
        { key: 'Enter', metaKey: false, ctrlKey: true },
        { apple: true },
      ),
    ).toBe(false)
  })

  it('accepts Ctrl+Enter on non-Apple', () => {
    expect(
      isDesktopSubmitShortcut(
        { key: 'Enter', metaKey: false, ctrlKey: true },
        { apple: false },
      ),
    ).toBe(true)
  })

  it('rejects bare Enter', () => {
    expect(
      isDesktopSubmitShortcut(
        { key: 'Enter', metaKey: false, ctrlKey: false },
        { apple: false },
      ),
    ).toBe(false)
  })
})

describe('submitShortcutKeys', () => {
  it('returns Mac chord', () => {
    expect(submitShortcutKeys(true)).toEqual({ mod: '⌘', key: 'Enter' })
  })

  it('returns Windows/Linux chord', () => {
    expect(submitShortcutKeys(false)).toEqual({ mod: 'Ctrl', key: 'Enter' })
  })
})

describe('isBlockedByForeignModal', () => {
  it('allows when no modal', () => {
    expect(isBlockedByForeignModal(null, null)).toBe(false)
  })

  it('blocks page-level root when a modal is open', () => {
    const modal = { contains: () => false }
    expect(isBlockedByForeignModal(null, modal)).toBe(true)
  })

  it('allows when root lives inside the open modal', () => {
    const root = { nodeType: 1 } as unknown as Node
    const modal = { contains: (node: Node | null) => node === root }
    expect(isBlockedByForeignModal(root, modal)).toBe(false)
  })
})
