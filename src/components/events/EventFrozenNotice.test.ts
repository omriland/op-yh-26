import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EventFrozenNotice } from './EventFrozenNotice'

describe('EventFrozenNotice', () => {
  it('renders nothing when the event is not frozen', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, {
        flags: { frozen_over_60km: false, frozen_suspicious_duplicate: false },
      }),
    )
    expect(html).toBe('')
  })

  it('states the km freeze reason as visible text, not a tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, { flags: { frozen_over_60km: true } }),
    )
    expect(html).toContain('event-frozen-notice')
    expect(html).toContain('מוקפא · חריגת ק״מ · ממתין לאישור מנהל')
    // The reason must not depend on hover/focus attributes to be readable.
    expect(html).not.toContain('aria-describedby')
  })

  it('states the duplicate freeze reason', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenNotice, { flags: { frozen_suspicious_duplicate: true } }),
    )
    expect(html).toContain('מוקפא · חשד לאירוע כפול · ממתין לאישור מנהל')
  })
})
