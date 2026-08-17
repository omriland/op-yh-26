import { supabase } from './supabase'
import { liveEventLine, livePinLabel, livePinTooltip } from './liveTrack'

export type LiveMapPin = {
  assignmentId: string
  lat: number
  lng: number
  label: string
  tooltip: string
}

type LiveRow = {
  event_responder_id: string
  lat: number
  lng: number
  recorded_at: string
  assignment: {
    ended_at: string | null
    responder: { full_name: string | null; callsign: string | null } | null
    event: {
      location: string | null
      event_type: { name: string } | null
      road: { name: string } | null
    } | null
  } | null
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function toPin(row: LiveRow): LiveMapPin | null {
  const assignment = asOne(row.assignment)
  if (assignment?.ended_at?.trim()) return null
  const person = asOne(assignment?.responder)
  const event = asOne(assignment?.event)
  const eventType = asOne(event?.event_type)
  const road = asOne(event?.road)
  return {
    assignmentId: row.event_responder_id,
    lat: row.lat,
    lng: row.lng,
    label: livePinLabel({
      callsign: person?.callsign ?? null,
      fullName: person?.full_name ?? 'כונן',
    }),
    tooltip: livePinTooltip({
      eventLine: liveEventLine({
        eventType: eventType?.name ?? null,
        road: road?.name ?? null,
        location: event?.location ?? null,
      }),
      recordedAt: row.recorded_at,
    }),
  }
}

export async function fetchLiveMapPins(): Promise<LiveMapPin[]> {
  const { data, error } = await supabase
    .from('event_responder_live_locations')
    .select(
      `
      event_responder_id,
      lat,
      lng,
      recorded_at,
      assignment:event_responders!inner (
        ended_at,
        responder:profiles!event_responders_responder_id_fkey (full_name, callsign),
        event:events!event_responders_event_id_fkey (
          location,
          event_type:event_types(name),
          road:roads(name)
        )
      )
    `,
    )

  if (error) throw error
  return ((data ?? []) as unknown as LiveRow[]).flatMap((row) => {
    const pin = toPin(row)
    return pin ? [pin] : []
  })
}

export function subscribeLiveMapPins(onChange: () => void): () => void {
  const channel = supabase
    .channel('event_responder_live_locations')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_responder_live_locations' },
      () => {
        onChange()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
