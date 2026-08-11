import { afterEach, describe, expect, it } from 'vitest'
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  nextSidebarWidthFromPointer,
  parseStoredSidebarWidth,
  readSidebarWidth,
  writeSidebarWidth,
} from './sidebarWidth'

describe('clampSidebarWidth', () => {
  it('keeps values in range', () => {
    expect(clampSidebarWidth(240)).toBe(240)
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN)).toBe(SIDEBAR_WIDTH_MIN)
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX)).toBe(SIDEBAR_WIDTH_MAX)
  })

  it('clamps below min and above max', () => {
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN - 40)).toBe(SIDEBAR_WIDTH_MIN)
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX + 40)).toBe(SIDEBAR_WIDTH_MAX)
  })

  it('rounds to nearest pixel', () => {
    expect(clampSidebarWidth(240.4)).toBe(240)
    expect(clampSidebarWidth(240.6)).toBe(241)
  })
})

describe('parseStoredSidebarWidth', () => {
  it('returns default for null / empty / non-numeric', () => {
    expect(parseStoredSidebarWidth(null)).toBe(SIDEBAR_WIDTH_DEFAULT)
    expect(parseStoredSidebarWidth('')).toBe(SIDEBAR_WIDTH_DEFAULT)
    expect(parseStoredSidebarWidth('abc')).toBe(SIDEBAR_WIDTH_DEFAULT)
  })

  it('parses and clamps stored numbers', () => {
    expect(parseStoredSidebarWidth('250')).toBe(250)
    expect(parseStoredSidebarWidth('100')).toBe(SIDEBAR_WIDTH_MIN)
    expect(parseStoredSidebarWidth('400')).toBe(SIDEBAR_WIDTH_MAX)
  })
})

describe('read/writeSidebarWidth', () => {
  const memory = new Map<string, string>()
  const storage: Pick<Storage, 'getItem' | 'setItem'> = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value)
    },
  }

  afterEach(() => {
    memory.clear()
  })

  it('reads default when unset', () => {
    expect(readSidebarWidth(storage)).toBe(SIDEBAR_WIDTH_DEFAULT)
  })

  it('persists clamped width under the project key', () => {
    writeSidebarWidth(storage, 255)
    expect(memory.get(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('255')
    expect(readSidebarWidth(storage)).toBe(255)
  })

  it('clamps on write', () => {
    writeSidebarWidth(storage, 10)
    expect(readSidebarWidth(storage)).toBe(SIDEBAR_WIDTH_MIN)
  })
})

describe('nextSidebarWidthFromPointer', () => {
  it('widens when dragging toward content in LTR', () => {
    expect(
      nextSidebarWidthFromPointer({
        startWidth: 240,
        startClientX: 240,
        clientX: 250,
        rtl: false,
      }),
    ).toBe(250)
  })

  it('widens when dragging toward content in RTL (clientX decreases)', () => {
    expect(
      nextSidebarWidthFromPointer({
        startWidth: 240,
        startClientX: 800,
        clientX: 790,
        rtl: true,
      }),
    ).toBe(250)
  })

  it('clamps during drag', () => {
    expect(
      nextSidebarWidthFromPointer({
        startWidth: 240,
        startClientX: 240,
        clientX: 400,
        rtl: false,
      }),
    ).toBe(SIDEBAR_WIDTH_MAX)
  })
})

describe('sidebar width bounds', () => {
  it('uses default 240 with min −50 and max +25', () => {
    expect(SIDEBAR_WIDTH_DEFAULT).toBe(240)
    expect(SIDEBAR_WIDTH_MIN).toBe(190)
    expect(SIDEBAR_WIDTH_MAX).toBe(265)
  })
})
