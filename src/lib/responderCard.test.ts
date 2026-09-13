import { describe, expect, it } from 'vitest'
import {
  responderCardShowsLeadKm,
  responderCardShowsOdometers,
  responderCardStartsOpen,
  viewerManagesEvent,
} from './responderCard'

describe('responderCardStartsOpen', () => {
  it('opens only the viewer’s own card when they are a responder', () => {
    expect(responderCardStartsOpen({ isViewer: true, manages: false })).toBe(true)
    expect(responderCardStartsOpen({ isViewer: false, manages: false })).toBe(false)
  })

  it('keeps every card collapsed for אחמ״ש and מנהל', () => {
    expect(responderCardStartsOpen({ isViewer: true, manages: true })).toBe(false)
    expect(responderCardStartsOpen({ isViewer: false, manages: true })).toBe(false)
  })
})

describe('responderCardShowsOdometers', () => {
  it('lets a כונן see מד אוץ on their own card only', () => {
    expect(responderCardShowsOdometers({ isViewer: true, manages: false })).toBe(true)
    expect(responderCardShowsOdometers({ isViewer: false, manages: false })).toBe(false)
  })

  it('lets אחמ״ש and מנהל see מד אוץ on every card', () => {
    expect(responderCardShowsOdometers({ isViewer: true, manages: true })).toBe(true)
    expect(responderCardShowsOdometers({ isViewer: false, manages: true })).toBe(true)
  })
})

describe('viewerManagesEvent', () => {
  it('is true for the event’s own אחמ״ש', () => {
    expect(viewerManagesEvent({ isEventLead: true, isAdmin: false })).toBe(true)
  })

  it('keeps a מנהל in the management view of an event they do not lead', () => {
    // The doc on responderCardShowsOdometers promises "lead/admin only", but the
    // page passed eventLead alone, so admins lost מד אוץ on every other card.
    expect(viewerManagesEvent({ isEventLead: false, isAdmin: true })).toBe(true)
  })

  it('is false for a אחמ״ש looking at an event they do not lead', () => {
    expect(viewerManagesEvent({ isEventLead: false, isAdmin: false })).toBe(false)
  })
})

describe('responderCardShowsLeadKm', () => {
  it('shows lead KM to a מנהל even when they are assigned as a כונן', () => {
    // Being assigned to an event must not strip the audit role of refund data.
    expect(
      responderCardShowsLeadKm({
        managesEvent: true,
        hasLeadRole: true,
        assignedAsResponder: true,
      }),
    ).toBe(true)
  })

  it('hides lead KM from a אחמ״ש participating in an event they do not lead', () => {
    expect(
      responderCardShowsLeadKm({
        managesEvent: false,
        hasLeadRole: true,
        assignedAsResponder: true,
      }),
    ).toBe(false)
  })

  it('still shows lead KM to a non-participating אחמ״ש', () => {
    expect(
      responderCardShowsLeadKm({
        managesEvent: false,
        hasLeadRole: true,
        assignedAsResponder: false,
      }),
    ).toBe(true)
  })

  it('never shows lead KM to a plain כונן', () => {
    expect(
      responderCardShowsLeadKm({
        managesEvent: false,
        hasLeadRole: false,
        assignedAsResponder: true,
      }),
    ).toBe(false)
  })
})
