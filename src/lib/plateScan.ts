import { plateDigits } from './format'
import { supabase } from './supabase'

export const PLATE_SCAN_TITLE = 'זוהו מספרי רכב בתמונות'
export const PLATE_SCAN_HINT = 'בדקו שהמספר נכון לפני ההוספה.'
export const PLATE_SCAN_ADD = 'הוספה'
export const PLATE_SCAN_DISMISS = 'לא נכון'
export const PLATE_SCAN_ADDED = 'המספר נוסף לרשימת הרכבים'

/**
 * Plates the model read off one uploaded photo (digits only).
 * Never throws: a failed scan just means no suggestions.
 */
export async function scanPlatesInMedia(mediaId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('plate-scan', {
      body: { media_id: mediaId },
    })
    if (error) return []
    const plates = (data as { plates?: unknown } | null)?.plates
    if (!Array.isArray(plates)) return []
    return plates.filter((row): row is string => typeof row === 'string').map(plateDigits)
  } catch {
    return []
  }
}

/** Adds newly scanned digits to the running list, without repeats. */
export function addPlateSuggestions(current: readonly string[], scanned: readonly string[]): string[] {
  const out = [...current]
  for (const value of scanned) {
    const digits = plateDigits(value)
    if (digits && !out.includes(digits)) out.push(digits)
  }
  return out
}

/** Only plates not already on the event, not in the form being filled, and not dismissed. */
export function visiblePlateSuggestions(
  suggestions: readonly string[],
  known: {
    eventPlates: readonly string[]
    formPlates: readonly string[]
    dismissed: readonly string[]
  },
): string[] {
  const hidden = new Set(
    [...known.eventPlates, ...known.formPlates, ...known.dismissed].map(plateDigits),
  )
  return suggestions.filter((digits) => !hidden.has(plateDigits(digits)))
}

export const PLATE_LINK_ACTION = 'שיוך לרכב'
export const PLATE_LINK_HINT = 'בחרו את הרכבים שמופיעים בתמונה.'
export const PLATE_LINK_SAVED = 'השיוך נשמר.'
export const PLATE_LINK_AUTO = 'התמונה שויכה לרכב'
export const PLATE_LINK_UNDONE = 'השיוך בוטל.'

/**
 * Digit match of a scan to saved plates. Nothing calls this on upload: a person
 * attaches the photo to a vehicle themselves. Already-linked plates are skipped.
 */
export function autoLinkPlateIds(
  scanned: readonly string[],
  plates: readonly { id: string; plate_number: string }[],
  linkedIds: readonly string[],
): string[] {
  const seen = new Set(scanned.map(plateDigits).filter(Boolean))
  return plates
    .filter((plate) => {
      const digits = plateDigits(plate.plate_number)
      return digits !== '' && seen.has(digits) && !linkedIds.includes(plate.id)
    })
    .map((plate) => plate.id)
}
