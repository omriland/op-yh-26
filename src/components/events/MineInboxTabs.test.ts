import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MineInboxTabs } from './MineInboxTabs'

describe('MineInboxTabs', () => {
  it('shows the open count on ממתינים לתיעוד and marks the active view', () => {
    const html = renderToStaticMarkup(
      createElement(MineInboxTabs, {
        tab: 'pending',
        pendingCount: 3,
        onChange: () => undefined,
      }),
    )

    expect(html).toContain('ממתינים לתיעוד 3')
    expect(html).toContain('תועדו')
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/aria-selected="true"[^>]*>ממתינים לתיעוד 3/)
  })
})
