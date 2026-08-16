import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MineShiftEventGroup } from './MineShiftEventGroup'

describe('MineShiftEventGroup', () => {
  it('starts collapsed so grouped events are hidden until opened', () => {
    const html = renderToStaticMarkup(
      createElement(MineShiftEventGroup, {
        title: 'משמרת · 16.08.2026 · בוקר · ניידת צפון',
        eventCount: 2,
        children: createElement('li', { className: 'card' }, 'אירוע ממשמרת'),
      }),
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('משמרת · 16.08.2026 · בוקר · ניידת צפון')
    expect(html).toContain('2 אירועים')
    expect(html).not.toContain('אירוע ממשמרת')
  })
})
