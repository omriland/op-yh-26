/**
 * Event-form field notes (רשומה).
 *
 * To add a note above a field: set an entry here. The create/edit form already
 * renders `<FieldNote field="…" />` for each id — no JSX change needed.
 *
 * Group keys (`event_times`, `patrol_callsign`) sit above a pair.
 * Use `started_at` / `ended_at` / `patrol_callsign_prefix` / `patrol_callsign_number`
 * only when the note belongs to one half.
 */
export type EventFormFieldNoteId =
  | 'shift_lead_id'
  | 'secondary_leads'
  | 'event_date'
  | 'police_event_id'
  | 'patrol_callsign'
  | 'patrol_callsign_prefix'
  | 'patrol_callsign_number'
  | 'event_times'
  | 'started_at'
  | 'ended_at'
  | 'district_id'
  | 'station'
  | 'event_type_id'
  | 'event_type_detail'
  | 'location'
  | 'road_id'
  | 'notes'

export type FieldNoteCopy = {
  note: string
  tooltip?: string
}

export const EVENT_TIMES_FIELD_NOTE =
  'שימו לב! מעתה הזנת זמנים תהיה עבור האירוע כולו ולא לכל מתנדב בנפרד'

export const EVENT_TIMES_FIELD_TOOLTIP =
  'זמן ההתחלה יהיה זמן היציאה של המתנדב הראשון וזמן הסיום יהיה זמן העזיבה של המתנדב האחרון'

export const PATROL_CALLSIGN_FIELD_NOTE =
  `אתם מתבקשים להזין או"ק מלא של הניידת כולל קידומת (אביב, חוף וכו')`

export const LOCATION_FIELD_NOTE = 'חדש! הזנת כביש באופן אוטומטי מבוסס על המיקום הנבחר'

export const LOCATION_FIELD_TOOLTIP =
  `מיקמנו את שדה 'מיקום' ראשון כדי להקל עליכם והטמענו הזנה אוטומטית של מספר הכביש. במקרה של כביש וק"מ או מיקום שאינו נמצא, תוכלו עדין להזין מספר כביש באופן ידני`

export const EVENT_FORM_FIELD_NOTES: Partial<Record<EventFormFieldNoteId, FieldNoteCopy>> = {
  event_times: {
    note: EVENT_TIMES_FIELD_NOTE,
    tooltip: EVENT_TIMES_FIELD_TOOLTIP,
  },
  patrol_callsign: {
    note: PATROL_CALLSIGN_FIELD_NOTE,
  },
  location: {
    note: LOCATION_FIELD_NOTE,
    tooltip: LOCATION_FIELD_TOOLTIP,
  },
}

export function eventFormFieldNote(id: EventFormFieldNoteId): FieldNoteCopy | undefined {
  return EVENT_FORM_FIELD_NOTES[id]
}
