import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EventFrozenMark } from './EventFrozenMark'

const admin = { userId: 'boss', isAdmin: true }

/** One responder over the km threshold, one under it, same event. */
const mixedEvent = {
  frozen_over_60km: true,
  frozen_suspicious_duplicate: false,
  responders: [
    { responder_id: 'over', frozen_over_60km: true },
    { responder_id: 'under', frozen_over_60km: false },
  ],
}

describe('EventFrozenMark', () => {
  it('renders nothing when nothing is frozen', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        event: { frozen_over_60km: false, frozen_suspicious_duplicate: false },
        viewer: admin,
      }),
    )
    expect(html).toBe('')
  })

  it('shows an admin a snowflake with the pending-review tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, { event: mixedEvent, viewer: admin }),
    )
    expect(html).toContain('event-frozen-mark')
    expect(html).toContain('באירוע קיימת הקפאה בגלל חריגת קילומטרים (מעל 80 ק״מ)')
  })

  it('explains both freeze reasons in the tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        event: { frozen_over_60km: true, frozen_suspicious_duplicate: true },
        viewer: admin,
      }),
    )
    expect(html).toContain('ובגלל חשד לאירוע כפול')
  })

  it('shows the over-threshold responder their own freeze', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        event: mixedEvent,
        viewer: { userId: 'over', isAdmin: false },
      }),
    )
    expect(html).toContain('הדיווח שלך מוקפא')
  })

  it('hides it from the responder under the threshold on the same event', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        event: mixedEvent,
        viewer: { userId: 'under', isAdmin: false },
      }),
    )
    expect(html).toBe('')
  })

  it('hides it from a shift-lead', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        event: mixedEvent,
        viewer: { userId: 'lead', isAdmin: false },
      }),
    )
    expect(html).toBe('')
  })

  it('hides it when no viewer was passed', () => {
    const html = renderToStaticMarkup(createElement(EventFrozenMark, { event: mixedEvent }))
    expect(html).toBe('')
  })
})
