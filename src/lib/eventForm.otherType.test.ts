import { describe, expect, it } from 'vitest'
import {
  EVENT_TYPE_DETAIL_MAX_LENGTH,
  OTHER_EVENT_TYPE_NAME,
  emptyEventDraft,
  eventTypeDetailForSave,
  isAbandonedEmptyEventDraft,
  isMissingEventTypeDetailColumn,
  isOtherEventTypeId,
  isOtherEventTypeName,
} from './eventForm'

const types = [
  { id: 'crash', name: 'תאונה' },
  { id: 'other', name: OTHER_EVENT_TYPE_NAME },
]

describe('other event type details', () => {
  it('matches the closed-list name אחר', () => {
    expect(isOtherEventTypeName('אחר')).toBe(true)
    expect(isOtherEventTypeName(' אחר ')).toBe(true)
    expect(isOtherEventTypeName('תאונה')).toBe(false)
    expect(isOtherEventTypeName(null)).toBe(false)
    expect(isOtherEventTypeId('other', types)).toBe(true)
    expect(isOtherEventTypeId('crash', types)).toBe(false)
  })

  it('saves trimmed text only when the type is אחר, and allows empty', () => {
    expect(
      eventTypeDetailForSave({ eventTypeId: 'other', eventTypes: types, detail: '  גרירה  ' }),
    ).toBe('גרירה')
    expect(
      eventTypeDetailForSave({ eventTypeId: 'other', eventTypes: types, detail: '   ' }),
    ).toBeNull()
    expect(
      eventTypeDetailForSave({ eventTypeId: 'crash', eventTypes: types, detail: 'גרירה' }),
    ).toBeNull()
  })

  it('caps the stored value at the short-field length', () => {
    const long = 'א'.repeat(EVENT_TYPE_DETAIL_MAX_LENGTH + 10)
    expect(
      eventTypeDetailForSave({ eventTypeId: 'other', eventTypes: types, detail: long })?.length,
    ).toBe(EVENT_TYPE_DETAIL_MAX_LENGTH)
  })

  it('keeps a create draft that only has פירוט typed', () => {
    const empty = emptyEventDraft({ full_name: 'א', callsign: '1' })
    expect(
      isAbandonedEmptyEventDraft(
        { ...empty, event_type_detail: 'גרירה' },
        empty.event_date,
      ),
    ).toBe(false)
  })

  it('detects a missing event_type_detail column', () => {
    expect(
      isMissingEventTypeDetailColumn({
        code: 'PGRST204',
        message: "Could not find the 'event_type_detail' column of 'events'",
      }),
    ).toBe(true)
    expect(isMissingEventTypeDetailColumn({ code: '42501', message: 'permission denied' })).toBe(
      false,
    )
  })
})
