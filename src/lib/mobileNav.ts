/** Daily destinations — keep these in the mobile tab bar when they exist. */
export const MOBILE_TAB_PRIMARY = ['events', 'mine', 'users', 'my_shifts'] as const

/** Reachable on mobile, but not every-session. Overflow into עוד. */
export const MOBILE_TAB_SECONDARY = ['shifts', 'contacts', 'map', 'reports'] as const

/** Five is the hard limit; the last slot is reserved for עוד when anything overflows. */
export const MOBILE_TAB_MAX = 4

export const MOBILE_MORE_LABEL = 'עוד'

const PRIMARY_RANK = new Map<string, number>(
  MOBILE_TAB_PRIMARY.map((view, index) => [view, index]),
)
const SECONDARY_RANK = new Map<string, number>(
  MOBILE_TAB_SECONDARY.map((view, index) => [view, index]),
)

function rank(view: string): number {
  const primary = PRIMARY_RANK.get(view)
  if (primary !== undefined) return primary
  const secondary = SECONDARY_RANK.get(view)
  if (secondary !== undefined) return MOBILE_TAB_PRIMARY.length + secondary
  return MOBILE_TAB_PRIMARY.length + MOBILE_TAB_SECONDARY.length
}

function isMenu<T extends { children?: readonly unknown[] }>(entry: T): boolean {
  return (entry.children?.length ?? 0) > 0
}

export function splitMobileNav<T extends { view?: string; children?: readonly unknown[] }>(
  entries: readonly T[],
): { tabs: T[]; more: T[] } {
  const menus = entries.filter(isMenu)
  const rest = entries.filter((entry) => !isMenu(entry))
  const ordered = [...rest].sort((a, b) => rank(a.view ?? '') - rank(b.view ?? ''))

  if (menus.length === 0) {
    if (ordered.length <= MOBILE_TAB_MAX) {
      return { tabs: ordered, more: [] }
    }
    return {
      tabs: ordered.slice(0, MOBILE_TAB_MAX - 1),
      more: ordered.slice(MOBILE_TAB_MAX - 1),
    }
  }

  if (ordered.length <= MOBILE_TAB_MAX - 1) {
    return { tabs: ordered, more: menus }
  }
  return {
    tabs: ordered.slice(0, MOBILE_TAB_MAX - 1),
    more: [...ordered.slice(MOBILE_TAB_MAX - 1), ...menus],
  }
}
