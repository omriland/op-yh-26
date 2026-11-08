import { describe, expect, it } from 'vitest'
import {
  DESKTOP_NAV_SECTIONS_KEY,
  groupDesktopNav,
  nextMenuIndex,
  readClosedSections,
  writeClosedSections,
  type DesktopNavEntry,
} from './desktopNav'

type E = DesktopNavEntry<string, string>

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const superAdminDesktop: E[] = [
  { view: 'mine', label: 'האירועים שלי', icon: 'i', attention: true },
  { view: 'my_shifts', label: 'המשמרות שלי', icon: 'i' },
  { view: 'contacts', label: 'אנשי קשר', icon: 'i' },
  { view: 'map', label: 'מפה', icon: 'i' },
  { view: 'cockpit', label: 'הקוקפיט', icon: 'i', section: 'כלים לאחמ״ש' },
  { view: 'events', label: 'אירועים', icon: 'i', section: 'כלים לאחמ״ש' },
  { view: 'shifts', label: 'משמרות', icon: 'i', section: 'כלים לאחמ״ש' },
  {
    menuId: 'super_admin',
    label: 'סופר־אדמין',
    icon: 'shield',
    section: 'ניהול',
    attention: true,
    children: [
      { view: 'feedback', label: 'משוב', icon: 'i', attention: true },
      { view: 'event_locations', label: 'מיקומים', icon: 'i' },
    ],
  },
  { view: 'search', label: 'חיפוש', icon: 'i', section: 'ניהול' },
  { view: 'users', label: 'משתמשים', icon: 'i', section: 'ניהול' },
  { view: 'reports', label: 'דוחות וסטטיסטיקות', icon: 'i', section: 'ניהול' },
  { view: 'lists', label: 'הגדרות', icon: 'i', pin: 'end' },
]

describe('groupDesktopNav', () => {
  it('keeps unsectioned entries as the untitled top group, in order', () => {
    const model = groupDesktopNav(superAdminDesktop)
    expect(model.top.map((e) => e.view)).toEqual(['mine', 'my_shifts', 'contacts', 'map'])
  })

  it('makes one section per existing nav section, and super admin its own section last', () => {
    const model = groupDesktopNav(superAdminDesktop)
    expect(model.sections.map((s) => s.title)).toEqual(['כלים לאחמ״ש', 'ניהול', 'סופר־אדמין'])
    expect(model.sections[1].items.map((e) => e.view)).toEqual(['users', 'reports'])
    expect(model.sections[2].items.map((e) => e.view)).toEqual(['feedback', 'event_locations'])
  })

  it('moves search and settings to the top bar', () => {
    const model = groupDesktopNav(superAdminDesktop)
    expect(model.hasSearch).toBe(true)
    expect(model.settings?.view).toBe('lists')
    const all = [...model.top, ...model.sections.flatMap((s) => s.items)]
    expect(all.some((e) => e.view === 'search' || e.view === 'lists')).toBe(false)
  })

  it('drops the profile pin (the avatar menu opens profile)', () => {
    const model = groupDesktopNav([
      { view: 'mine', label: 'האירועים שלי', icon: 'i' },
      { view: 'profile', label: 'פרופיל', icon: 'i', pin: 'end' },
    ])
    expect(model.top.map((e) => e.view)).toEqual(['mine'])
    expect(model.hasSearch).toBe(false)
    expect(model.settings).toBeNull()
  })

  it('adds nothing a role did not already have', () => {
    const responder: E[] = [
      { view: 'mine', label: 'האירועים שלי', icon: 'i' },
      { view: 'my_shifts', label: 'המשמרות שלי', icon: 'i' },
      { view: 'contacts', label: 'אנשי קשר', icon: 'i' },
      { view: 'map', label: 'מפה', icon: 'i' },
      { view: 'profile', label: 'פרופיל', icon: 'i', pin: 'end' },
    ]
    const model = groupDesktopNav(responder)
    expect(model.sections).toEqual([])
    expect(model.top).toHaveLength(4)
  })
})

describe('nav prefs', () => {
  it('starts with every section open', () => {
    expect(readClosedSections(memoryStorage())).toEqual([])
  })

  it('round-trips closed sections', () => {
    const storage = memoryStorage()
    writeClosedSections(storage, ['ניהול'])
    expect(readClosedSections(storage)).toEqual(['ניהול'])
  })

  it('ignores malformed stored sections', () => {
    expect(readClosedSections(memoryStorage({ [DESKTOP_NAV_SECTIONS_KEY]: '{oops' }))).toEqual([])
    expect(readClosedSections(memoryStorage({ [DESKTOP_NAV_SECTIONS_KEY]: '[1,"a"]' }))).toEqual([
      'a',
    ])
  })
})

describe('nextMenuIndex', () => {
  it('wraps arrows and jumps with Home/End', () => {
    expect(nextMenuIndex('ArrowDown', -1, 3)).toBe(0)
    expect(nextMenuIndex('ArrowDown', 2, 3)).toBe(0)
    expect(nextMenuIndex('ArrowUp', 0, 3)).toBe(2)
    expect(nextMenuIndex('ArrowUp', -1, 3)).toBe(2)
    expect(nextMenuIndex('Home', 2, 3)).toBe(0)
    expect(nextMenuIndex('End', 0, 3)).toBe(2)
    expect(nextMenuIndex('Tab', 0, 3)).toBeNull()
    expect(nextMenuIndex('ArrowDown', 0, 0)).toBeNull()
  })
})
