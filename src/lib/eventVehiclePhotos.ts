import { plateDigits } from './format'
import type { TreatedPlate } from './treatedPlates'
import type { EventMediaPlateOption, PendingMediaLink } from './eventMedia'
import { supabase } from './supabase'

export const VEHICLE_PHOTOS_TITLE = 'לא צורפו תמונות לרכבים הבאים:'
export const VEHICLE_PHOTOS_BACK = 'חזרה לעריכה'
export const VEHICLE_PHOTOS_PROCEED = 'שמירה ללא תמונות נוספות'

/**
 * Under the vehicle list when the person has photos with no vehicle: the photo
 * was saved, it just is not linked, which is what the prompt is really about.
 */
export function unlinkedPhotosNote(count: number): string | null {
  if (count <= 0) return null
  const lead = count === 1 ? 'יש לך תמונה אחת ללא שיוך לרכב.' : `יש לך ${count} תמונות ללא שיוך לרכב.`
  return `${lead} כדי לשייך: חזרה לעריכה, פתיחת התמונה ובחירת הרכב.`
}

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
  coveredDigits: ReadonlySet<string>,
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
  options: readonly Pick<EventMediaPlateOption, 'id' | 'plate_number'>[],
): PhotoCoveragePlate[] {
  return options.map((plate) => ({
    id: plate.id,
    plate_digits: plateDigits(plate.plate_number),
  }))
}

/**
 * Saved coverage plus the photos linked to a vehicle the form has not saved yet.
 * Without the second part, a photo of a just-added vehicle reads as missing.
 */
export function withPendingPhotoLinks(
  saved: ReadonlySet<string>,
  pending: readonly PendingMediaLink[],
): Set<string> {
  const covered = new Set(saved)
  for (const link of pending) {
    for (const digits of link.digits) {
      const key = plateDigits(digits)
      if (key) covered.add(key)
    }
  }
  return covered
}

/**
 * Plate digits with a saved photo link, or null when the read failed. A failed
 * read must not be taken as "no photos": the save prompt would then name vehicles
 * the person did photograph.
 */
export async function fetchEventPhotoCoverage(eventId: string): Promise<Set<string> | null> {
  const plateSelect = 'id, plate_number'
  const [media, eventKeyed, responderKeyed] = await Promise.all([
    supabase
      .from('event_media')
      .select('id, plates:event_media_plates(treated_plate_id)')
      .eq('event_id', eventId),
    supabase.from('event_treated_plates').select(plateSelect).eq('event_id', eventId),
    supabase
      .from('event_treated_plates')
      .select(
        `${plateSelect}, event_responders!event_treated_plates_event_responder_id_fkey!inner(event_id)`,
      )
      .eq('event_responders.event_id', eventId),
  ])
  if (media.error || eventKeyed.error || responderKeyed.error) return null

  const plates = [...(eventKeyed.data ?? []), ...(responderKeyed.data ?? [])].flatMap((row) =>
    row.id && row.plate_number ? [{ id: row.id, plate_number: row.plate_number }] : [],
  )
  const mediaRows = (media.data ?? []).map((row) => ({
    treated_plate_ids: plateIdsFromMediaRow(
      row.plates as { treated_plate_id: string } | { treated_plate_id: string }[] | null,
    ),
  }))

  return coveredPlateDigits(mediaRows, coveragePlatesFromOptions(plates))
}
