import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DateGroup, DateGroups } from './DateGroups'

describe('DateGroups', () => {
  it('scopes each sticky header to its own group so it cannot stay pinned over later sections', () => {
    const html = renderToStaticMarkup(
      createElement(
        DateGroups,
        null,
        createElement(
          DateGroup,
          { heading: 'אירועים הממתינים לתיעוד' },
          createElement('ul', { className: 'stack-3' }, createElement('li', { className: 'card' }, 'א')),
        ),
        createElement(
          DateGroup,
          { heading: 'אירועים שתועדו' },
          createElement('ul', { className: 'stack-3' }, createElement('li', { className: 'card' }, 'ב')),
        ),
      ),
    )

    expect(html.startsWith('<div class="event-groups">')).toBe(true)
    expect(html).toContain(
      '<section class="event-group"><h2 class="group-head">אירועים הממתינים לתיעוד</h2><ul class="stack-3"><li class="card">א</li></ul></section>',
    )
    expect(html).toContain(
      '<section class="event-group"><h2 class="group-head">אירועים שתועדו</h2><ul class="stack-3"><li class="card">ב</li></ul></section>',
    )
    expect(html).not.toMatch(
      /<h2 class="group-head">אירועים הממתינים לתיעוד<\/h2><ul class="stack-3">[\s\S]*<\/ul><h2 class="group-head">אירועים שתועדו<\/h2>/,
    )
  })

  it('marks the logged group so completed cards can recede', () => {
    const html = renderToStaticMarkup(
      createElement(DateGroup, { heading: 'אירועים שתועדו', logged: true }, 'x'),
    )
    expect(html).toContain('class="event-group event-group--logged"')
  })
})
