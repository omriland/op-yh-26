import { describe, expect, it, vi } from 'vitest'
import { sidebarCreateAction } from './sidebarCreate'

describe('sidebarCreateAction', () => {
  const onCreateEvent = vi.fn()
  const onCreateShift = vi.fn()

  it('binds אירוע חדש only to the events row', () => {
    expect(sidebarCreateAction('events', onCreateEvent, onCreateShift)).toEqual({
      onCreate: onCreateEvent,
      label: 'אירוע חדש',
    })
  })

  it('binds משמרת חדשה only to the shifts row', () => {
    expect(sidebarCreateAction('shifts', onCreateEvent, onCreateShift)).toEqual({
      onCreate: onCreateShift,
      label: 'משמרת חדשה',
    })
  })

  it('does not attach create to other nav rows', () => {
    expect(sidebarCreateAction('mine', onCreateEvent, onCreateShift)).toBeNull()
    expect(sidebarCreateAction('reports', onCreateEvent, onCreateShift)).toBeNull()
  })

  it('hides the button when the matching create handler is missing', () => {
    expect(sidebarCreateAction('events')).toBeNull()
    expect(sidebarCreateAction('shifts', onCreateEvent)).toBeNull()
  })
})
