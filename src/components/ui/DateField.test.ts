import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DateField } from './DateField'

describe('DateField', () => {
  it('renders an ISO date as day-first DD.MM.YYYY, never month-first slashes', () => {
    const html = renderToStaticMarkup(
      createElement(DateField, {
        label: 'תאריך',
        value: '2026-10-05',
        onChange: () => {},
      }),
    )
    expect(html).toContain('05.10.2026')
    expect(html).not.toContain('10/05/2026')
    expect(html).not.toContain('10.05.2026')
    expect(html).toContain('type="text"')
    expect(html).toContain('יום.חודש.שנה')
  })
})
