import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FuelFrozenEventsMark } from './FuelFrozenEventsMark'

describe('FuelFrozenEventsMark', () => {
  it('renders nothing when the volunteer has no frozen events', () => {
    const html = renderToStaticMarkup(createElement(FuelFrozenEventsMark, { count: 0 }))
    expect(html).toBe('')
  })

  it('shows a snowflake with a one-event tooltip', () => {
    const html = renderToStaticMarkup(createElement(FuelFrozenEventsMark, { count: 1 }))
    expect(html).toContain('event-frozen-mark')
    expect(html).toContain('יש אירוע הקפאה אחד')
  })

  it('pluralizes the tooltip for several frozen events', () => {
    const html = renderToStaticMarkup(createElement(FuelFrozenEventsMark, { count: 3 }))
    expect(html).toContain('יש 3 אירועי הקפאה')
  })
})
