import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DateGroup, DateGroups } from './DateGroups'

describe('DateGroups', () => {
  it('keeps date headers as siblings so sticky is not trapped in a one-card section', () => {
    const html = renderToStaticMarkup(
      createElement(
        DateGroups,
        null,
        createElement(
          DateGroup,
          { heading: '30.11.2026' },
          createElement('ul', { className: 'stack-3' }, createElement('li', { className: 'card' }, 'א')),
        ),
        createElement(
          DateGroup,
          { heading: '29.11.2026' },
          createElement('ul', { className: 'stack-3' }, createElement('li', { className: 'card' }, 'ב')),
        ),
      ),
    )

    expect(html.startsWith('<div class="event-groups">')).toBe(true)
    expect(html).not.toContain('<section')
    expect(html).toMatch(
      /<h2 class="group-head">30\.11\.2026<\/h2><ul class="stack-3">[\s\S]*<\/ul><h2 class="group-head">29\.11\.2026<\/h2>/,
    )
  })
})
