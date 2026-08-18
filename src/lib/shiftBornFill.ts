import { fetchEventLookups, type LookupOption } from './eventForm'
import { fetchEventDetail, type EventDetail } from './events'
import { COUNT_DECREASE_BLOCKED, STALE_SAVE_MESSAGE } from './shiftBornEvents'
import type { EventStatus } from './status'
import { supabase } from './supabase'
import { mapTreatedPlateRows, type TreatedPlate } from './treatedPlates'

export type ShiftBornFillDraft = {
  police_event_id: string
  treatment_detail: string
  treatment_notes: string
  road_id: string
  location: string
  treated: { vehicle_kind_id: string; quantity: number }[]
  treated_plates: TreatedPlate[]
}

export type ShiftBornFillContext = {
  event: EventDetail
  vehicleKinds: LookupOption[]
  roads: LookupOption[]
  draft: ShiftBornFillDraft
  expected_updated_at: string
}

export function emptyShiftBornFillDraft(): ShiftBornFillDraft {
  return {
    police_event_id: '',
    treatment_detail: '',
    treatment_notes: '',
    road_id: '',
    location: '',
    treated: [],
    treated_plates: [],
  }
}

export type ShiftBornEventFillRow = {
  id: string
  typeName: string
  status: EventStatus
  expected_updated_at: string
  draft: ShiftBornFillDraft
}

export function shiftBornEventFillRowsFrom(
  events: ReadonlyArray<{
    id: string
    status: EventStatus
    police_event_id: string | null
    treatment_detail: string | null
    treatment_notes: string | null
    road_id?: string | null
    location?: string | null
    updated_at?: string | null
    event_type: { name: string } | null
    treated: ReadonlyArray<{ vehicle_kind_id?: string | null; quantity?: number | null }>
    treated_plates?: ReadonlyArray<{
      plate_number?: string | null
      model?: string | null
      color?: string | null
      left_where?: string | null
      sort_order?: number | null
    }>
  }>,
): ShiftBornEventFillRow[] {
  return events.flatMap((event) => {
    if (!event.updated_at) return []
    return [
      {
        id: event.id,
        typeName: event.event_type?.name ?? 'אירוע',
        status: event.status,
        expected_updated_at: event.updated_at,
        draft: {
          police_event_id: event.police_event_id ?? '',
          treatment_detail: event.treatment_detail ?? '',
          treatment_notes: event.treatment_notes ?? '',
          road_id: event.road_id ?? '',
          location: event.location ?? '',
          treated: event.treated.flatMap((row) => {
            if (!row.vehicle_kind_id || !row.quantity || row.quantity <= 0) return []
            return [{ vehicle_kind_id: row.vehicle_kind_id, quantity: row.quantity }]
          }),
          treated_plates: mapTreatedPlateRows(event.treated_plates),
        },
      },
    ]
  })
}

export async function fetchShiftBornFillContext(
  eventId: string,
): Promise<ShiftBornFillContext | null> {
  const [event, lookups] = await Promise.all([fetchEventDetail(eventId), fetchEventLookups()])
  if (!event || event.origin !== 'shift') return null

  const [{ data: treated, error }, { data: plates, error: platesError }] = await Promise.all([
    supabase.from('event_treated_vehicles').select('vehicle_kind_id, quantity').eq('event_id', eventId),
    supabase
      .from('event_treated_plates')
      .select('plate_number, model, color, left_where, sort_order')
      .eq('event_id', eventId)
      .order('sort_order'),
  ])

  if (error) throw new Error(error.message)
  if (platesError) throw new Error(platesError.message)

  return {
    event,
    vehicleKinds: lookups.vehicleKinds,
    roads: lookups.roads,
    expected_updated_at: event.updated_at,
    draft: {
      police_event_id: event.police_event_id ?? '',
      treatment_detail: event.treatment_detail ?? '',
      treatment_notes: event.treatment_notes ?? '',
      road_id: event.road_id ?? '',
      location: event.location ?? '',
      treated: (treated ?? []).map((row) => ({
        vehicle_kind_id: row.vehicle_kind_id as string,
        quantity: row.quantity as number,
      })),
      treated_plates: mapTreatedPlateRows(plates),
    },
  }
}

function mapFillError(message: string | undefined): string {
  if (message?.includes(STALE_SAVE_MESSAGE)) return STALE_SAVE_MESSAGE
  if (message?.includes(COUNT_DECREASE_BLOCKED)) return COUNT_DECREASE_BLOCKED
  if (message?.includes('אין הרשאה')) return 'אין הרשאה'
  return 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.'
}

export async function saveShiftBornEventFill(input: {
  eventId: string
  expectedUpdatedAt: string
  draft: ShiftBornFillDraft
  complete: boolean
}): Promise<{ ok: true; updated_at: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('save_shift_born_event_fill', {
    p_event_id: input.eventId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_police_event_id: input.draft.police_event_id,
    p_road_id: input.draft.road_id.trim() || null,
    p_location: input.draft.location,
    p_treatment_detail: input.draft.treatment_detail,
    p_emergency_means: false,
    p_treatment_notes: input.draft.treatment_notes,
    p_treated: input.draft.treated,
    p_complete: input.complete,
    p_plates: input.draft.treated_plates,
  })

  if (error) {
    return { ok: false, error: mapFillError(error.message) }
  }
  return { ok: true, updated_at: data as string }
}
