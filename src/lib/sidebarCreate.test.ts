import { describe, expect, it, vi } from 'vitest'
import { parseAppPath } from './appRoute'
import {
  SHIFT_LEAD_NAV_SECTION,
  isSidebarCreateEventCurrent,
  sidebarLeadNewEvent,
} from './sidebarCreate'

describe('sidebarLeadNewEvent', () => {
  const onCreateEvent = vi.fn()

  it('binds אירוע חדש to the כלים לאחמ״ש section, not a nav row', () => {
    expect(sidebarLeadNewEvent(SHIFT_LEAD_NAV_SECTION, onCreateEvent)).toEqual({
      onCreate: onCreateEvent,
      label: 'אירוע חדש',
    })
    expect(sidebarLeadNewEvent('ניהול', onCreateEvent)).toBeNull()
    expect(sidebarLeadNewEvent(SHIFT_LEAD_NAV_SECTION)).toBeNull()
  })
})

describe('isSidebarCreateEventCurrent', () => {
  it('is current on create, including a query-only form surface', () => {
    expect(isSidebarCreateEventCurrent({ kind: 'form' })).toBe(true)
    expect(isSidebarCreateEventCurrent({ kind: 'form', eventId: undefined })).toBe(true)
  })

  it('marks /events/new as create (query lives on the URL, not the path)', () => {
    const parsed = parseAppPath('/events/new')
    expect(parsed.kind).toBe('app')
    if (parsed.kind !== 'app') return
    expect(isSidebarCreateEventCurrent(parsed.state.eventSurface)).toBe(true)
  })

  it('is not current on list, edit, detail, or fill', () => {
    expect(isSidebarCreateEventCurrent({ kind: 'list' })).toBe(false)
    expect(isSidebarCreateEventCurrent({ kind: 'form', eventId: 'evt-1' })).toBe(false)
    expect(isSidebarCreateEventCurrent({ kind: 'detail', eventId: 'evt-1' })).toBe(false)
    expect(isSidebarCreateEventCurrent({ kind: 'fill', eventId: 'evt-1' })).toBe(false)
    expect(isSidebarCreateEventCurrent(null)).toBe(false)
  })
})

