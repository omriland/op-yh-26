import { describe, expect, it, vi } from 'vitest'
import { SHIFT_LEAD_NAV_SECTION, sidebarCreateAction, sidebarLeadNewEvent } from './sidebarCreate'

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

describe('sidebarCreateAction', () => {
  const onCreateShift = vi.fn()

  it('binds משמרת חדשה only to the shifts row', () => {
    expect(sidebarCreateAction('shifts', onCreateShift)).toEqual({
      onCreate: onCreateShift,
      label: 'משמרת חדשה',
    })
  })

  it('does not attach a + to אירועים or other nav rows', () => {
    expect(sidebarCreateAction('events', onCreateShift)).toBeNull()
    expect(sidebarCreateAction('mine', onCreateShift)).toBeNull()
    expect(sidebarCreateAction('reports', onCreateShift)).toBeNull()
  })

  it('hides the button when the matching create handler is missing', () => {
    expect(sidebarCreateAction('shifts')).toBeNull()
  })
})
