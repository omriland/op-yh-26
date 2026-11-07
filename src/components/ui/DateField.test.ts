import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DateField } from './DateField'

function dateInput(html: string): string {
  const match = html.match(/<input[^>]*type="date"[^>]*>/)
  if (!match) throw new Error('missing type="date" input')
  return match[0]
}

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
    const picker = dateInput(html)
    expect(picker).toContain('field__date-picker')
    expect(picker).toContain('value="2026-10-05"')
    expect(picker).toContain('בחירת תאריך בלוח שנה')
    expect(picker).not.toContain('visually-hidden')
    expect(picker).not.toContain('aria-hidden')
    expect(picker).not.toContain('tabindex="-1"')
  })

  it('omits the native value when the date is empty so iOS can open the picker again', () => {
    const html = renderToStaticMarkup(
      createElement(DateField, {
        label: 'תאריך',
        value: '',
        onChange: () => {},
      }),
    )
    expect(dateInput(html)).not.toContain('value=')
  })
})
