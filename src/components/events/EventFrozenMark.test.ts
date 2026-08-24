import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EventFrozenMark } from './EventFrozenMark'

describe('EventFrozenMark', () => {
  it('renders nothing when the event is not frozen', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        flags: { frozen_over_60km: false, frozen_suspicious_duplicate: false },
      }),
    )
    expect(html).toBe('')
  })

  it('shows a snowflake with the 60km pending-review tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        flags: { frozen_over_60km: true, frozen_suspicious_duplicate: false },
      }),
    )
    expect(html).toContain('event-frozen-mark')
    expect(html).toContain('האירוע מוקפא בגלל חריגת קילומטרים (מעל 60 ק״מ) וממתין לאישור מנהל.')
  })

  it('explains both freeze reasons in the tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EventFrozenMark, {
        flags: { frozen_over_60km: true, frozen_suspicious_duplicate: true },
      }),
    )
    expect(html).toContain('ובגלל חשד לאירוע כפול')
  })
})
