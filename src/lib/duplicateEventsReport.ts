import { supabase } from './supabase'

export const DUPLICATE_TIME_WINDOW_MINUTES = 30

const WINDOW_MS = DUPLICATE_TIME_WINDOW_MINUTES * 60 * 1000

export type DuplicateParticipationSource = {
  event_id: string
  responder_id: string
  event_date: string
  location: string | null
  started_at: string | null
  is_cancelled: boolean
  police_event_id: string | null
  event_type_name: string | null
  road_name: string | null
  full_name: string | null
  callsign: string | null
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
  approved_suspicious_duplicate?: boolean
}

export type DuplicateMember = {
  event_id: string
  responder_id: string
  event_date: string
  location: string
  started_at: string
  is_cancelled: boolean
  police_event_id: string | null
  event_type_name: string | null
  road_name: string | null
  full_name: string | null
  callsign: string | null
  frozen_over_60km: boolean
  frozen_suspicious_duplicate: boolean
  approved_suspicious_duplicate: boolean
}

export type DuplicateCluster = {
  id: string
  sizeLabel: 'כפול' | 'משולש'
  event_date: string
  members: DuplicateMember[]
}

function normalizeLocation(location: string | null): string | null {
  if (location == null) return null
  const trimmed = location.trim()
  return trimmed === '' ? null : trimmed
}

function pairMatches(a: DuplicateParticipationSource, b: DuplicateParticipationSource): boolean {
  if (a.event_id === b.event_id) return false
  if (a.responder_id !== b.responder_id) return false
  if (a.event_date !== b.event_date) return false

  const locA = normalizeLocation(a.location)
  const locB = normalizeLocation(b.location)
  if (locA == null || locB == null || locA !== locB) return false

  if (a.started_at == null || b.started_at == null) return false
  const diff = Math.abs(new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
  return diff <= WINDOW_MS
}

function toMember(src: DuplicateParticipationSource): DuplicateMember {
  return {
    event_id: src.event_id,
    responder_id: src.responder_id,
    event_date: src.event_date,
    location: normalizeLocation(src.location)!,
    started_at: src.started_at!,
    is_cancelled: src.is_cancelled,
    police_event_id: src.police_event_id,
    event_type_name: src.event_type_name,
    road_name: src.road_name,
    full_name: src.full_name,
    callsign: src.callsign,
    frozen_over_60km: Boolean(src.frozen_over_60km),
    frozen_suspicious_duplicate: Boolean(src.frozen_suspicious_duplicate),
    approved_suspicious_duplicate: Boolean(src.approved_suspicious_duplicate),
  }
}

/** Union-find clusters of matching participations (transitive). */
export function buildDuplicateClusters(
  sources: DuplicateParticipationSource[],
): DuplicateCluster[] {
  const n = sources.length
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]!)
    return parent[i]!
  }

  function union(i: number, j: number) {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[ri] = rj
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pairMatches(sources[i]!, sources[j]!)) union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = groups.get(root) ?? []
    list.push(i)
    groups.set(root, list)
  }

  const clusters: DuplicateCluster[] = []
  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const members = indices
      .map((i) => toMember(sources[i]!))
      .sort((a, b) => a.started_at.localeCompare(b.started_at))

    if (members.every((member) => member.approved_suspicious_duplicate)) continue

    const event_date = members[0]!.event_date
    clusters.push({
      id: members.map((m) => m.event_id).sort().join(':'),
      sizeLabel: members.length >= 3 ? 'משולש' : 'כפול',
      event_date,
      members,
    })
  }

  clusters.sort((a, b) => {
    const byDate = b.event_date.localeCompare(a.event_date)
    if (byDate !== 0) return byDate
    return b.members.length - a.members.length
  })

  return clusters
}

type EventQueryRow = {
  id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
  approved_suspicious_duplicate?: boolean
  event_type: { name: string } | { name: string }[] | null
  road: { name: string } | { name: string }[] | null
  responders:
    | {
        responder_id: string
        started_at: string | null
        profile: { full_name: string; callsign: string } | { full_name: string; callsign: string }[] | null
      }[]
    | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function flattenEvents(events: EventQueryRow[]): DuplicateParticipationSource[] {
  const rows: DuplicateParticipationSource[] = []
  for (const event of events) {
    const eventType = one(event.event_type)
    const road = one(event.road)
    for (const responder of event.responders ?? []) {
      const profile = one(responder.profile)
      rows.push({
        event_id: event.id,
        responder_id: responder.responder_id,
        event_date: event.event_date,
        location: event.location,
        started_at: responder.started_at,
        is_cancelled: event.is_cancelled,
        police_event_id: event.police_event_id,
        event_type_name: eventType?.name ?? null,
        road_name: road?.name ?? null,
        full_name: profile?.full_name ?? null,
        callsign: profile?.callsign ?? null,
        frozen_over_60km: Boolean(event.frozen_over_60km),
        frozen_suspicious_duplicate: Boolean(event.frozen_suspicious_duplicate),
        approved_suspicious_duplicate: Boolean(event.approved_suspicious_duplicate),
      })
    }
  }
  return rows
}

const DUPLICATE_SELECT = `
  id,
  event_date,
  is_cancelled,
  police_event_id,
  location,
  frozen_over_60km,
  frozen_suspicious_duplicate,
  approved_suspicious_duplicate,
  event_type:event_types(name),
  road:roads(name),
  responders:event_responders(
    responder_id,
    started_at,
    profile:profiles(full_name, callsign)
  )
`

export async function fetchDuplicateClusters(): Promise<DuplicateCluster[]> {
  const { data, error } = await supabase
    .from('events')
    .select(DUPLICATE_SELECT)
    .order('event_date', { ascending: false })

  if (error) throw new Error(error.message)
  return buildDuplicateClusters(flattenEvents((data ?? []) as unknown as EventQueryRow[]))
}
