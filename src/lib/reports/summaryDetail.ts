import {
  EVENT_FIELDS_SELECT,
  RESPONDER_FIELDS_SELECT,
  buildEventsByResponderRows,
  type EventsByResponderEventSource,
  type EventsByResponderRow,
  type EventsByResponderSource,
} from '../eventsByResponderReport'
import { supabase } from '../supabase'
import type { ReportDateRange } from './types'
import type { SummaryGroup, SummaryRpcRow } from './summaryReport'

const EVENT_COLUMN_OF_GROUP = {
  road: 'road_id',
  district: 'district_id',
  event_type: 'event_type_id',
  shift_lead: 'shift_lead_id',
} as const

type EventGroup = keyof typeof EVENT_COLUMN_OF_GROUP

const EVENTS_OF_GROUP_SELECT = `
  ${EVENT_FIELDS_SELECT},
  responders:event_responders(${RESPONDER_FIELDS_SELECT})
`

const RESPONDER_PARTICIPATIONS_SELECT = `
  ${RESPONDER_FIELDS_SELECT},
  event:events!inner(${EVENT_FIELDS_SELECT})
`

type ParticipationWithEvent = EventsByResponderSource & {
  event: Omit<EventsByResponderEventSource, 'responders'>
}

function isFrozenParticipation(responder: EventsByResponderSource): boolean {
  return Boolean(responder.frozen_over_60km || responder.frozen_suspicious_duplicate)
}

/** The summary leaves frozen participations out of its km, so the detail shows none for them. */
function countedParticipationKm(responder: EventsByResponderSource): number | null {
  return isFrozenParticipation(responder) ? null : responder.total_km
}

function countedEventKm(responders: EventsByResponderSource[]): number {
  return responders.reduce((sum, responder) => sum + (countedParticipationKm(responder) ?? 0), 0)
}

function responderNames(responders: EventsByResponderSource[]): string | null {
  const names = responders.map((responder) => responder.profile?.full_name).filter(Boolean)
  return names.length > 0 ? names.join('، ') : null
}

/** One line for a whole event, with every responder's name and the km the summary counted. */
export function wholeEventRow(event: EventsByResponderEventSource): EventsByResponderRow {
  return {
    id: event.id,
    event_id: event.id,
    event_date: event.event_date,
    is_cancelled: event.is_cancelled,
    police_event_id: event.police_event_id,
    event_type_name: event.event_type?.name ?? null,
    district_name: event.district?.name ?? null,
    road_name: event.road?.name ?? null,
    location: event.location,
    shift_lead_name: event.shift_lead?.full_name ?? null,
    shift_lead_callsign: event.shift_lead?.callsign ?? null,
    total_km: countedEventKm(event.responders),
    responder_id: '',
    responder_name: responderNames(event.responders),
    responder_callsign: null,
    frozen_over_60km: Boolean(event.frozen_over_60km),
    frozen_suspicious_duplicate: Boolean(event.frozen_suspicious_duplicate),
  }
}

export function responderEventRows(
  participations: ParticipationWithEvent[],
  range: ReportDateRange,
): EventsByResponderRow[] {
  const events = participations.map(({ event, ...responder }) => ({
    ...event,
    responders: [{ ...responder, total_km: countedParticipationKm(responder) }],
  }))
  return buildEventsByResponderRows(events, range)
}

async function loadResponderEvents(
  range: ReportDateRange,
  responderId: string,
): Promise<EventsByResponderRow[]> {
  const { data, error } = await supabase
    .from('event_responders')
    .select(RESPONDER_PARTICIPATIONS_SELECT)
    .eq('responder_id', responderId)
    .gte('event.event_date', range.from)
    .lte('event.event_date', range.to)
  if (error) throw new Error(error.message)
  return responderEventRows((data ?? []) as unknown as ParticipationWithEvent[], range)
}

/** The ids of events the summary does not count: the shift half of a joint pair. */
async function fetchUncountedEventIds(range: ReportDateRange): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('event_counting_keys', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(error.message)
  const keys = (data ?? []) as Array<{ event_id: string; is_counted: boolean }>
  return new Set(keys.filter((key) => !key.is_counted).map((key) => key.event_id))
}

/** Drops the events the summary left out of its count, so the list matches the row. */
export function keepCountedEvents<T extends { id: string }>(events: T[], uncountedIds: Set<string>): T[] {
  return events.filter((event) => !uncountedIds.has(event.id))
}

async function loadEventsOfGroup(
  range: ReportDateRange,
  group: EventGroup,
  groupId: string | null,
): Promise<EventsByResponderRow[]> {
  const column = EVENT_COLUMN_OF_GROUP[group]
  const query = supabase
    .from('events')
    .select(EVENTS_OF_GROUP_SELECT)
    .gte('event_date', range.from)
    .lte('event_date', range.to)
    .order('event_date', { ascending: false })
  const { data, error } = await (groupId === null ? query.is(column, null) : query.eq(column, groupId))
  if (error) throw new Error(error.message)
  const events = (data ?? []) as unknown as EventsByResponderEventSource[]
  const uncountedIds = await fetchUncountedEventIds(range)
  return keepCountedEvents(events, uncountedIds).map(wholeEventRow)
}

/** The events one summary row counted, fetched by the row's own group id. */
export async function loadSummaryDetailRows(
  range: ReportDateRange,
  group: SummaryGroup,
  summary: SummaryRpcRow,
): Promise<EventsByResponderRow[]> {
  if (group !== 'responder') return loadEventsOfGroup(range, group, summary.group_id)
  return summary.group_id ? loadResponderEvents(range, summary.group_id) : []
}
