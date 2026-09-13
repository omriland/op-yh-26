import { describe, expect, it } from 'vitest'
import {
  EVENT_FORM_FIELD_NOTES,
  EVENT_TIMES_FIELD_NOTE,
  EVENT_TIMES_FIELD_TOOLTIP,
  LOCATION_FIELD_NOTE,
  LOCATION_FIELD_TOOLTIP,
  PATROL_CALLSIGN_FIELD_NOTE,
  eventFormFieldNote,
} from './eventFormFieldNotes'

describe('eventFormFieldNotes', () => {
  it('stores the approved event-times, callsign, and location copy', () => {
    expect(eventFormFieldNote('event_times')).toEqual({
      note: EVENT_TIMES_FIELD_NOTE,
      tooltip: EVENT_TIMES_FIELD_TOOLTIP,
    })
    expect(EVENT_TIMES_FIELD_NOTE).toBe(
      'שימו לב! מעתה הזנת זמנים תהיה עבור האירוע כולו ולא לכל מתנדב בנפרד',
    )
    expect(EVENT_TIMES_FIELD_TOOLTIP).toBe(
      'זמן ההתחלה יהיה זמן היציאה של המתנדב הראשון וזמן הסיום יהיה זמן העזיבה של המתנדב האחרון',
    )

    expect(eventFormFieldNote('patrol_callsign')).toEqual({
      note: PATROL_CALLSIGN_FIELD_NOTE,
    })
    expect(PATROL_CALLSIGN_FIELD_NOTE).toBe(
      `אתם מתבקשים להזין או״ק מלא של הניידת כולל קידומת (אביב, חוף וכו')`,
    )
    expect(eventFormFieldNote('patrol_callsign')?.tooltip).toBeUndefined()

    expect(eventFormFieldNote('location')).toEqual({
      note: LOCATION_FIELD_NOTE,
      tooltip: LOCATION_FIELD_TOOLTIP,
    })
    expect(LOCATION_FIELD_NOTE).toBe('חדש! הזנת כביש באופן אוטומטי מבוסס על המיקום הנבחר')
    expect(LOCATION_FIELD_TOOLTIP).toBe(
      `מיקמנו את שדה 'מיקום' ראשון כדי להקל עליכם והטמענו הזנה אוטומטית של מספר הכביש. במקרה של כביש וק״מ או מיקום שאינו נמצא, תוכלו עדיין להזין מספר כביש באופן ידני`,
    )
  })

  it('leaves per-half and unused ids empty', () => {
    expect(eventFormFieldNote('police_event_id')).toBeUndefined()
    expect(eventFormFieldNote('patrol_callsign_prefix')).toBeUndefined()
    expect(eventFormFieldNote('patrol_callsign_number')).toBeUndefined()
    expect(eventFormFieldNote('started_at')).toBeUndefined()
    expect(eventFormFieldNote('ended_at')).toBeUndefined()
    expect(Object.keys(EVENT_FORM_FIELD_NOTES)).toEqual([
      'event_times',
      'patrol_callsign',
      'location',
    ])
  })
})
