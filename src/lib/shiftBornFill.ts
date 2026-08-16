import { fetchEventLookups, type LookupOption } from './eventForm'
import { fetchEventDetail, type EventDetail } from './events'
import { COUNT_DECREASE_BLOCKED, STALE_SAVE_MESSAGE } from './shiftBornEvents'
import { supabase } from './supabase'

export type ShiftBornFillDraft = {
  police_event_id: string
  treatment_detail: string
  treatment_notes: string
  treated: { vehicle_kind_id: string; quantity: number }[]
}

export type ShiftBornFillContext = {
  event: EventDetail
  vehicleKinds: LookupOption[]
  draft: ShiftBornFillDraft
  expected_updated_at: string
}

export function emptyShiftBornFillDraft(): ShiftBornFillDraft {
  return {
    police_event_id: '',
    treatment_detail: '',
    treatment_notes: '',
    treated: [],
  }
}

export async function fetchShiftBornFillContext(
  eventId: string,
): Promise<ShiftBornFillContext | null> {
  const [event, lookups] = await Promise.all([fetchEventDetail(eventId), fetchEventLookups()])
  if (!event || event.origin !== 'shift') return null

  const { data: treated, error } = await supabase
    .from('event_treated_vehicles')
    .select('vehicle_kind_id, quantity')
    .eq('event_id', eventId)

  if (error) throw new Error(error.message)

  return {
    event,
    vehicleKinds: lookups.vehicleKinds,
    expected_updated_at: event.updated_at,
    draft: {
      police_event_id: event.police_event_id ?? '',
      treatment_detail: event.treatment_detail ?? '',
      treatment_notes: event.treatment_notes ?? '',
      treated: (treated ?? []).map((row) => ({
        vehicle_kind_id: row.vehicle_kind_id as string,
        quantity: row.quantity as number,
      })),
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
    p_treatment_detail: input.draft.treatment_detail,
    p_emergency_means: false,
    p_treatment_notes: input.draft.treatment_notes,
    p_treated: input.draft.treated,
    p_complete: input.complete,
  })

  if (error) {
    return { ok: false, error: mapFillError(error.message) }
  }
  return { ok: true, updated_at: data as string }
}
