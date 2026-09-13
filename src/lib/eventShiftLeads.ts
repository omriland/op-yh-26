/** Create/edit form section title — gershayim match `אחמ״ש`. */
export const EVENT_FORM_LEADS_SECTION = 'אחמ״ש/ים'
export const MAIN_LEAD_LABEL = 'אחמ״ש ראשי'
export const MAIN_LEAD_LABEL_SHORT = 'אחמ״ש'
export const SECONDARY_LEAD_LABEL = 'אחמ״ש משני'
export const SECONDARY_LEAD_ADD = 'הוספת אחמ״ש משני'
/** Compact placeholder for the 33%-wide picker trigger. */
export const SECONDARY_LEAD_ADD_SHORT = 'הוספה'
export const SECONDARY_LEAD_REMOVE = 'הסרת אחמ״ש משני'
export const SECONDARY_LEAD_LOCKED_HINT = 'נוסף אוטומטית בעריכה — לא ניתן להסיר'
export const SECONDARY_LEAD_PICKER_EMPTY = 'אין אחמ״שים פעילים להוספה.'
export const SECONDARY_LEAD_PICKER_NONE = 'לא נמצאו אחמ״שים'
export const MAIN_LEAD_LOCKED_HINT = 'רק מנהל יכול להחליף אחמ״ש ראשי לאחר יצירת האירוע.'

export type LeadPerson = {
  full_name: string
  callsign: string
}

export type SecondaryLead = LeadPerson & {
  user_id: string
  locked: boolean
  added_at?: string
}

export type ShiftLeadCandidate = LeadPerson & { id: string }

function hasAnyRole(roles: readonly string[], wanted: readonly string[]): boolean {
  return wanted.some((role) => roles.includes(role))
}

export function canManageSecondaryLeads(roles: readonly string[]): boolean {
  return hasAnyRole(roles, ['shift_lead', 'admin', 'super_admin'])
}

export function canChangeEventMainLead(input: {
  roles: readonly string[]
  eventExists: boolean
  viewerIsCurrentMain: boolean
  hasSecondaries: boolean
}): boolean {
  if (hasAnyRole(input.roles, ['admin', 'super_admin'])) return true
  if (!input.roles.includes('shift_lead')) return false
  if (!input.eventExists) return true
  return input.viewerIsCurrentMain && !input.hasSecondaries
}

export function canRemoveSecondaryLead(input: {
  roles: readonly string[]
  locked: boolean
}): boolean {
  return !input.locked && canManageSecondaryLeads(input.roles)
}

export function shouldAutoLockSecondary(input: {
  viewerId: string | undefined | null
  mainLeadId: string | undefined | null
  persistedFieldChange: boolean
  viewerHasShiftLead: boolean
}): boolean {
  if (!input.persistedFieldChange || !input.viewerHasShiftLead) return false
  const viewer = input.viewerId?.trim() ?? ''
  const main = input.mainLeadId?.trim() ?? ''
  return Boolean(viewer && main && viewer !== main)
}

export function createTimeCreatorSecondary(input: {
  creatorId: string
  mainLeadId: string
}): { user_id: string; locked: false } | null {
  const creator = input.creatorId.trim()
  const main = input.mainLeadId.trim()
  if (!creator || !main || creator === main) return null
  return { user_id: creator, locked: false }
}

export function reassignMainLeads(input: {
  previousMainId: string
  nextMainId: string
  previousMain: LeadPerson
  previousMainLocked?: boolean
  secondaries: SecondaryLead[]
}): { mainId: string; secondaries: SecondaryLead[] } {
  const previous = input.previousMainId.trim()
  const next = input.nextMainId.trim()
  if (!next || next === previous) {
    return { mainId: previous, secondaries: input.secondaries }
  }
  const kept = input.secondaries.filter((row) => row.user_id !== next)
  const already = kept.find((row) => row.user_id === previous)
  const demoted: SecondaryLead = already
    ? { ...already, locked: already.locked || Boolean(input.previousMainLocked) }
    : {
        user_id: previous,
        locked: Boolean(input.previousMainLocked),
        full_name: input.previousMain.full_name,
        callsign: input.previousMain.callsign,
      }
  const withoutDup = kept.filter((row) => row.user_id !== previous)
  return { mainId: next, secondaries: [...withoutDup, demoted] }
}

export function filterShiftLeadPicker(
  people: readonly ShiftLeadCandidate[],
  excludeIds: readonly string[],
  query: string,
): ShiftLeadCandidate[] {
  const excluded = new Set(excludeIds)
  const needle = query.trim().toLowerCase()
  return people.filter((person) => {
    if (excluded.has(person.id)) return false
    if (!needle) return true
    return (
      person.full_name.toLowerCase().includes(needle) ||
      person.callsign.toLowerCase().includes(needle)
    )
  })
}

export type SecondaryLeadOption = ShiftLeadCandidate & {
  selected: boolean
  /** Locked rows (auto-added on persist) can never be removed — greyed, non-interactive. */
  removable: boolean
}

/** Selected secondaries pinned first, then the remaining shift_lead candidates. */
export function buildSecondaryLeadOptions(input: {
  candidates: readonly ShiftLeadCandidate[]
  selected: readonly SecondaryLead[]
  mainLeadId?: string | null
  roles: readonly string[]
}): SecondaryLeadOption[] {
  const main = input.mainLeadId?.trim() ?? ''
  const byId = new Map(input.candidates.map((person) => [person.id, person]))
  const pinned = input.selected.flatMap((row) => {
    const person = byId.get(row.user_id)
    return [
      {
        id: row.user_id,
        full_name: person?.full_name || row.full_name,
        callsign: person?.callsign || row.callsign,
        selected: true,
        removable: canRemoveSecondaryLead({ roles: input.roles, locked: row.locked }),
      },
    ]
  })
  const pinnedIds = new Set(pinned.map((row) => row.id))
  const rest = input.candidates
    .filter((person) => person.id !== main && !pinnedIds.has(person.id))
    .map((person) => ({
      id: person.id,
      full_name: person.full_name,
      callsign: person.callsign,
      selected: false,
      removable: true,
    }))
  return [...pinned, ...rest]
}

/** Maps picker values back to secondary rows, keeping locked rows and lock/profile data. */
export function applySecondaryLeadSelection(input: {
  values: readonly string[]
  current: readonly SecondaryLead[]
  candidates: readonly ShiftLeadCandidate[]
  mainLeadId?: string | null
  roles: readonly string[]
}): SecondaryLead[] {
  const main = input.mainLeadId?.trim() ?? ''
  const currentById = new Map(input.current.map((row) => [row.user_id, row]))
  const candidateById = new Map(input.candidates.map((person) => [person.id, person]))
  const kept: SecondaryLead[] = []
  const seen = new Set<string>()

  const keep = (row: SecondaryLead) => {
    if (seen.has(row.user_id)) return
    seen.add(row.user_id)
    kept.push(row)
  }

  for (const value of input.values) {
    const id = value.trim()
    if (!id || id === main) continue
    const existing = currentById.get(id)
    if (existing) {
      keep(existing)
      continue
    }
    const person = candidateById.get(id)
    if (!person) continue
    keep({
      user_id: id,
      locked: false,
      full_name: person.full_name,
      callsign: person.callsign,
    })
  }

  // A locked secondary is never removable — restore it even if the picker dropped it.
  for (const row of input.current) {
    if (row.user_id === main) continue
    if (canRemoveSecondaryLead({ roles: input.roles, locked: row.locked })) continue
    keep(row)
  }

  return kept
}

/** Compact closed-trigger text: first name, plus `+N` for the rest. Never a chip list. */
export function formatSecondaryLeadTrigger(secondaries: readonly LeadPerson[]): string {
  if (secondaries.length === 0) return ''
  const first = secondaries[0]
  const name = first.full_name.trim() || first.callsign.trim()
  const rest = secondaries.length - 1
  return rest > 0 ? `${name} +${rest}` : name
}

function sameLeadId(
  viewerId: string | undefined | null,
  otherId: string | undefined | null,
): boolean {
  const viewer = viewerId?.trim() ?? ''
  const other = otherId?.trim() ?? ''
  return Boolean(viewer && other && viewer === other)
}

/** True when the viewer is this event's main or secondary אחמ״ש — not merely a lead-role user. */
export function viewerIsEventLead(input: {
  viewerId?: string | null
  shiftLeadId?: string | null
  secondaryLeadIds?: readonly (string | null | undefined)[]
}): boolean {
  if (sameLeadId(input.viewerId, input.shiftLeadId)) return true
  return (input.secondaryLeadIds ?? []).some((id) => sameLeadId(input.viewerId, id))
}

export function eventLeadFieldLabel(hasSecondaries: boolean): string {
  return hasSecondaries ? MAIN_LEAD_LABEL : MAIN_LEAD_LABEL_SHORT
}

export function formatLeadPerson(person: LeadPerson | null | undefined): string {
  const name = person?.full_name.trim() ?? ''
  const callsign = person?.callsign.trim() ?? ''
  return [name, callsign].filter(Boolean).join(' · ')
}

export function formatLeadsCaption(
  main: LeadPerson | null | undefined,
  secondaries: readonly LeadPerson[] = [],
): string {
  const parts = [
    formatLeadPerson(main),
    ...secondaries.map((row) => formatLeadPerson(row)),
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Unit/location lists: main `שם · או״ק` only. Desktop may append ` +N` for secondaries. */
export function formatListLeadCaption(
  main: LeadPerson | null | undefined,
  secondaries: readonly LeadPerson[] = [],
  opts: { overflowCount?: boolean } = {},
): string {
  const mainText = formatLeadPerson(main)
  if (!mainText) return ''
  const count = secondaries.length
  if (opts.overflowCount && count > 0) return `${mainText} +${count}`
  return mainText
}

export function formatListLeadTooltip(secondaries: readonly LeadPerson[] = []): string {
  return secondaries.map((row) => formatLeadPerson(row)).filter(Boolean).join(' · ')
}

export const EVENT_SECONDARY_LEADS_EMBED = `secondary_leads:event_secondary_leads(user_id, locked, added_at, profile:profiles!event_secondary_leads_user_id_fkey(full_name, callsign))`

export function mapSecondaryLeadRows(rows: unknown): SecondaryLead[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const item = row as {
      user_id?: string
      locked?: boolean
      added_at?: string
      profile?: { full_name?: string | null; callsign?: string | null } | null
    }
    const userId = item.user_id?.trim() ?? ''
    if (!userId) return []
    return [
      {
        user_id: userId,
        locked: Boolean(item.locked),
        added_at: item.added_at,
        full_name: item.profile?.full_name?.trim() || (typeof (item as { full_name?: string }).full_name === 'string' ? (item as { full_name: string }).full_name.trim() : ''),
        callsign: item.profile?.callsign?.trim() || (typeof (item as { callsign?: string }).callsign === 'string' ? (item as { callsign: string }).callsign.trim() : ''),
      },
    ]
  })
}
