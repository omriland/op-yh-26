import { plateDigits } from './format'
import type { TreatedPlate } from './treatedPlates'
import { listEventMediaPlates, type EventMediaPlateOption } from './eventMedia'
import { supabase } from './supabase'

export const VEHICLE_PHOTOS_TITLE = 'לא צורפו תמונות לרכבים הבאים:'
export const VEHICLE_PHOTOS_BACK = 'חזרה לעריכה'
export const VEHICLE_PHOTOS_PROCEED = 'שמירה ללא תמונות נוספות'

export type PhotoCoveragePlate = {
  id: string
  plate_digits: string
}

/** Plate digits that already have at least one attached photo (any uploader). */
export function coveredPlateDigits(
  media: readonly { treated_plate_ids: readonly string[] }[],
  plates: readonly PhotoCoveragePlate[],
): Set<string> {
  const digitsById = new Map(plates.map((plate) => [plate.id, plate.plate_digits]))
  const covered = new Set<string>()
  for (const item of media) {
    for (const plateId of item.treated_plate_ids) {
      const digits = digitsById.get(plateId)
      if (digits) covered.add(digits)
    }
  }
  return covered
}

/**
 * Vehicles on this responder's log that have no photo on the event.
 * A photo attached to several plates counts for each; another responder's
 * photo on the same plate number also counts.
 */
export function vehiclesMissingPhotos(
  myPlates: readonly TreatedPlate[],
  coveredDigits: Set<string>,
): TreatedPlate[] {
  return myPlates.filter((plate) => {
    const digits = plateDigits(plate.plate_number)
    return Boolean(digits) && !coveredDigits.has(digits)
  })
}

function plateIdsFromMediaRow(
  plates: { treated_plate_id: string } | { treated_plate_id: string }[] | null | undefined,
): string[] {
  if (!plates) return []
  const rows = Array.isArray(plates) ? plates : [plates]
  return rows.map((row) => row.treated_plate_id).filter(Boolean)
}

export function coveragePlatesFromOptions(
  options: readonly EventMediaPlateOption[],
): PhotoCoveragePlate[] {
  return options.map((plate) => ({
    id: plate.id,
    plate_digits: plateDigits(plate.plate_number),
  }))
}

/** Lightweight coverage fetch — no signed image URLs. */
export async function fetchEventPhotoCoverage(eventId: string): Promise<{
  coveredDigits: Set<string>
}> {
  const [{ data: media }, plates] = await Promise.all([
    supabase
      .from('event_media')
      .select('id, plates:event_media_plates(treated_plate_id)')
      .eq('event_id', eventId),
    listEventMediaPlates(eventId),
  ])

  const mediaRows = (media ?? []).map((row) => ({
    treated_plate_ids: plateIdsFromMediaRow(
      row.plates as { treated_plate_id: string } | { treated_plate_id: string }[] | null,
    ),
  }))

  return {
    coveredDigits: coveredPlateDigits(mediaRows, coveragePlatesFromOptions(plates)),
  }
}
