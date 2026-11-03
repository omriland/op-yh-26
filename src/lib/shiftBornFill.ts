import { EVENT_DONE_NEEDS_END_ERROR, EVENT_DONE_NEEDS_KM_ERROR } from './eventStatus'
import {
  fetchEventLookups,
  POLICE_EVENT_ID_DUPLICATE_ERROR,
  type LookupOption,
} from './eventForm'
import { fetchEventDetail, type EventDetail } from './events'
import { policeEventIdForInput } from './format'
import { refreshShiftLogStatus } from './shiftForm'
import {
  COUNT_DECREASE_BLOCKED,
  SHIFT_BORN_DONE_LOCKED,
  SHIFT_BORN_TOO_EARLY,
  STALE_SAVE_MESSAGE,
} from './shiftBornEvents'
import type { EventStatus } from './status'
import { supabase } from './supabase'
import { mapTreatedPlateRows, type TreatedPlate } from './treatedPlates'
import { TREATMENT_DETAIL_MIN_ERROR, treatmentDetailMeetsMinimum } from './treatmentDetail'

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

export type ShiftBornFillErrors = Partial<
  Record<'road_id' | 'location' | 'treatment_detail', string>
>

/**
 * Completion bar for a shift-born treatment record.
 *
 * This door into the record previously validated nothing, so the same treatment a
 * responder must fill in five fields could be completed empty from here. The bar is
 * the subset of the responder rule that a shift-born event can actually answer:
 * where it happened and what was done. Draft saves are never blocked.
 *
 * No end time and no KM: the shift carries the one odometer pair, and this record
 * has no field for either, so asking for them would block completion for good.
 */
export function shiftBornCompleteErrors(
  draft: ShiftBornFillDraft,
  event?: {
    /** A cancelled event still needs a word on what happened, but not 40 characters. */
    is_cancelled?: boolean
  },
): ShiftBornFillErrors {
  const errors: ShiftBornFillErrors = {}
  if (!draft.road_id) errors.road_id = 'יש לבחור כביש'
  if (!draft.location.trim()) errors.location = 'יש להזין מיקום'
  if (event?.is_cancelled) {
    if (!draft.treatment_detail.trim()) errors.treatment_detail = 'יש להזין פירוט טיפול'
  } else if (!treatmentDetailMeetsMinimum(draft.treatment_detail)) {
    errors.treatment_detail = TREATMENT_DETAIL_MIN_ERROR
  }
  return errors
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
      manufacturer?: string | null
      logo_slug?: string | null
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
      .select('plate_number, model, color, left_where, manufacturer, logo_slug, sort_order')
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

/** The RPC's own Hebrew refusals say what to do; show them as they are. */
export function shiftBornFillErrorMessage(message: string | undefined): string {
  if (message?.includes(STALE_SAVE_MESSAGE)) return STALE_SAVE_MESSAGE
  if (message?.includes(COUNT_DECREASE_BLOCKED)) return COUNT_DECREASE_BLOCKED
  if (message?.includes(SHIFT_BORN_TOO_EARLY)) return SHIFT_BORN_TOO_EARLY
  if (message?.includes(SHIFT_BORN_DONE_LOCKED)) return SHIFT_BORN_DONE_LOCKED
  if (message?.includes('אין הרשאה')) return 'אין הרשאה'
  if (message?.includes(EVENT_DONE_NEEDS_END_ERROR)) return EVENT_DONE_NEEDS_END_ERROR
  if (message?.includes(EVENT_DONE_NEEDS_KM_ERROR)) return EVENT_DONE_NEEDS_KM_ERROR
  if (message?.includes(POLICE_EVENT_ID_DUPLICATE_ERROR)) return POLICE_EVENT_ID_DUPLICATE_ERROR
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
    p_police_event_id: policeEventIdForInput(input.draft.police_event_id) || null,
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
    return { ok: false, error: shiftBornFillErrorMessage(error.message) }
  }

  const { data: parent } = await supabase
    .from('events')
    .select('shift_id')
    .eq('id', input.eventId)
    .maybeSingle()
  if (parent?.shift_id) {
    await refreshShiftLogStatus(parent.shift_id as string)
  }

  return { ok: true, updated_at: data as string }
}
