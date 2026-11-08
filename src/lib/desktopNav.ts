/**
 * Desktop shell (≥1025px) navigation model. Pure: takes the role-filtered entries
 * App.tsx already builds and only regroups them, so visibility rules stay in one place.
 *
 * - Entries with no section and no pin: the untitled top group.
 * - Entries sharing a `section`: one collapsible section each, in first-seen order.
 * - The super admin parent (menuId `super_admin`): its own section of its children, last.
 * - `search`: moves to the top bar field. `lists` (הגדרות): the top bar Settings button.
 * - `profile` (end pin): dropped, the avatar menu already opens it.
 */

export type DesktopNavEntry<V extends string, I> = {
  view?: V
  menuId?: string
  label: string
  icon: I
  section?: string
  attention?: boolean
  pin?: 'end'
  children?: DesktopNavEntry<V, I>[]
}

export type DesktopNavSection<V extends string, I> = {
  id: string
  title: string
  items: DesktopNavEntry<V, I>[]
  /** Super admin keeps its own rail icon; other sections get theirs from the shell. */
  icon?: I
}

export type DesktopNavModel<V extends string, I> = {
  top: DesktopNavEntry<V, I>[]
  sections: DesktopNavSection<V, I>[]
  hasSearch: boolean
  settings: DesktopNavEntry<V, I> | null
}

export const SUPER_ADMIN_MENU_ID = 'super_admin'

export function groupDesktopNav<V extends string, I>(
  entries: DesktopNavEntry<V, I>[],
): DesktopNavModel<V, I> {
  const top: DesktopNavEntry<V, I>[] = []
  const sections: DesktopNavSection<V, I>[] = []
  let superAdmin: DesktopNavSection<V, I> | null = null
  let hasSearch = false
  let settings: DesktopNavEntry<V, I> | null = null

  for (const entry of entries) {
    if (entry.view === 'search') {
      hasSearch = true
      continue
    }
    if (entry.view === 'lists') {
      settings = entry
      continue
    }
    if (entry.pin === 'end') continue
    if (entry.menuId === SUPER_ADMIN_MENU_ID && entry.children?.length) {
      superAdmin = {
        id: SUPER_ADMIN_MENU_ID,
        title: entry.label,
        items: entry.children,
        icon: entry.icon,
      }
      continue
    }
    if (!entry.section) {
      top.push(entry)
      continue
    }
    const existing = sections.find((section) => section.title === entry.section)
    if (existing) existing.items.push(entry)
    else sections.push({ id: entry.section, title: entry.section, items: [entry] })
  }

  if (superAdmin) sections.push(superAdmin)
  return { top, sections, hasSearch, settings }
}

export function sectionHasAttention<V extends string, I>(
  section: DesktopNavSection<V, I>,
): boolean {
  return section.items.some((item) => Boolean(item.attention))
}

export function sectionIsCurrent<V extends string, I>(
  section: DesktopNavSection<V, I>,
  view: V,
  creatingEvent: boolean,
): boolean {
  if (creatingEvent) return false
  return section.items.some((item) => item.view === view)
}

// ---------- persisted prefs (open/collapsed, per-section open state) ----------

export const DESKTOP_NAV_OPEN_KEY = 'yahpaz.desktopNav.open'
export const DESKTOP_NAV_SECTIONS_KEY = 'yahpaz.desktopNav.sections'

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>

/** First visit: open. */
export function readNavOpen(storage: PrefStorage): boolean {
  return storage.getItem(DESKTOP_NAV_OPEN_KEY) !== '0'
}

export function writeNavOpen(storage: PrefStorage, open: boolean): void {
  storage.setItem(DESKTOP_NAV_OPEN_KEY, open ? '1' : '0')
}

/** Section ids the user closed. Every other section is open (first visit: all open). */
export function readClosedSections(storage: PrefStorage): string[] {
  const raw = storage.getItem(DESKTOP_NAV_SECTIONS_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeClosedSections(storage: PrefStorage, closed: string[]): void {
  storage.setItem(DESKTOP_NAV_SECTIONS_KEY, JSON.stringify(closed))
}

/** Next index for roving focus in a menu: arrows wrap, Home/End jump. */
export function nextMenuIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
