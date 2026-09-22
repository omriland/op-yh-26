import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  LEAD_KM_VIEW_LABEL,
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
  it('shows lead KM to any אחמ״ש / מנהל role, including when they are also assigned', () => {
    expect(responderCardShowsLeadKm({ hasLeadRole: true })).toBe(true)
  })

  it('never shows lead KM to a plain כונן', () => {
    expect(responderCardShowsLeadKm({ hasLeadRole: false })).toBe(false)
  })

  it('labels the view-only field ק״מ (אחמ״ש)', () => {
    expect(LEAD_KM_VIEW_LABEL).toBe('ק״מ (אחמ״ש)')
  })

  it('uses that label on event detail and hides the row unless the viewer has a lead role', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../pages/EventDetailPage.tsx'),
      'utf8',
    )
    expect(source).toContain('label={LEAD_KM_VIEW_LABEL}')
    expect(source).not.toContain('label="קילומטרים"')
    expect(source).toContain('responderCardShowsLeadKm({ hasLeadRole: canSeeLeadKm })')
    expect(source).toContain("label='מד אוץ התחלה'")
    expect(source).toContain("label='מד אוץ סיום'")
  })
})
