import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EventFrozenNotice } from './EventFrozenNotice'

const admin = { userId: 'boss', isAdmin: true }

describe('EventFrozenNotice', () => {
  it('renders nothing when nothing is frozen', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, {
        event: { frozen_over_60km: false, frozen_suspicious_duplicate: false },
        viewer: admin,
      }),
    )
    expect(html).toBe('')
  })

  it('states the km freeze reason as visible text, not a tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, { event: { frozen_over_60km: true }, viewer: admin }),
    )
    expect(html).toContain('event-frozen-notice')
    expect(html).toContain('מוקפא · חריגת ק״מ · ממתין לאישור מנהל')
    // The reason must not depend on hover/focus attributes to be readable.
    expect(html).not.toContain('aria-describedby')
  })

  it('states the duplicate freeze reason', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, {
        event: { frozen_suspicious_duplicate: true },
        viewer: admin,
      }),
    )
    expect(html).toContain('מוקפא · חשד לאירוע כפול · ממתין לאישור מנהל')
  })

  it('owns the wording when the frozen record is the reader own', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, {
        participation: { responder_id: 'over', frozen_over_60km: true },
        viewer: { userId: 'over', isAdmin: false },
      }),
    )
    expect(html).toContain('הדיווח שלך מוקפא · חריגת ק״מ · ממתין לאישור מנהל')
  })

  it('hides a teammate frozen record from a plain responder', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, {
        participation: { responder_id: 'over', frozen_over_60km: true },
        viewer: { userId: 'under', isAdmin: false },
      }),
    )
    expect(html).toBe('')
  })
})
