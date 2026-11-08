import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter.ts'

/** What global search may show. Rows are scoped by RLS; this decides keys and groups. */
export type SearchRole = 'admin' | 'lead' | 'responder'

export function searchRoleFor(roles: readonly string[]): SearchRole {
  if (roles.includes('admin') || roles.includes('super_admin')) return 'admin'
  if (roles.includes('shift_lead')) return 'lead'
  return 'responder'
}

/** The old-site archive is admins only; other roles see no trace of it. */
export function canUseArchive(role: SearchRole): boolean {
  return role === 'admin'
}

export type DroppedKey = { key: 'volunteer_status' | 'no_shift'; reason: string }

export const DROPPED_REASONS: Record<DroppedKey['key'], string> = {
  volunteer_status: 'החיפוש לפי מעמד מתנדב זמין למנהלים ולאחמ״שים',
  no_shift: 'החיפוש לפי משמרות זמין למנהלים ולאחמ״שים',
}

/**
 * The filter this role may run, and the keys it lost. Archive keys go silently for
 * non-admins; people-only keys a responder cannot use come back as dropped, so the
 * chip can say why. The server applies the same rule again.
 */
export function filterForRole(
  filter: SmartSearchFilter,
  role: SearchRole,
): { filter: SmartSearchFilter; dropped: DroppedKey[] } {
  const next: SmartSearchFilter = { ...filter }
  const dropped: DroppedKey[] = []
  if (!canUseArchive(role)) {
    if (next.source === 'archive' || next.source === 'both') next.source = 'new'
    delete next.damage_location
    delete next.person_callsigns
  }
  if (role === 'responder') {
    // A כונן never sees a טיוטה, so the key would only ever find nothing.
    if (next.status === 'draft') delete next.status
    if (next.volunteer_status) {
      dropped.push({ key: 'volunteer_status', reason: DROPPED_REASONS.volunteer_status })
      delete next.volunteer_status
    }
    if (next.no_shift_from || next.no_shift_to) {
      dropped.push({ key: 'no_shift', reason: DROPPED_REASONS.no_shift })
      delete next.no_shift_from
      delete next.no_shift_to
    }
  }
  return { filter: next, dropped }
}
