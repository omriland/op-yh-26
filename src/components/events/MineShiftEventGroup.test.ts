import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MineShiftEventGroup } from './MineShiftEventGroup'

describe('MineShiftEventGroup', () => {
  it('starts open when the inbox still has events to log', () => {
    const html = renderToStaticMarkup(
      createElement(MineShiftEventGroup, {
        title: 'משמרת · 16.08.2026 · בוקר · ניידת צפון',
        caption: '2 לתעד',
        defaultOpen: true,
        children: createElement('li', { className: 'card' }, 'אירוע ממשמרת'),
      }),
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('משמרת · 16.08.2026 · בוקר · ניידת צפון')
    expect(html).toContain('2 לתעד')
    expect(html).not.toContain('2 אירועים')
    expect(html).toContain('אירוע ממשמרת')
    expect(html).toContain('mine-shift-group')
    expect(html).not.toContain('assignment-card')
  })

  it('starts collapsed when nothing in the group is waiting', () => {
    const html = renderToStaticMarkup(
      createElement(MineShiftEventGroup, {
        title: 'משמרת · 16.08.2026 · בוקר · ניידת צפון',
        caption: '2 אירועים',
        defaultOpen: false,
        children: createElement('li', { className: 'card' }, 'אירוע ממשמרת'),
      }),
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('אירוע ממשמרת')
  })
})
