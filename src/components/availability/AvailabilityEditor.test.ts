import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AvailabilityEditor } from './AvailabilityEditor'

describe('AvailabilityEditor', () => {
  it('has no save or cancel actions — choice writes immediately', () => {
    const html = renderToStaticMarkup(
      createElement(AvailabilityEditor, {
        initialStatus: 'available',
        initialAvailableFrom: null,
        onSave: () => undefined,
      }),
    )

    expect(html).toContain('זמין')
    expect(html).toContain('לא זמין')
    expect(html).not.toContain('שמירה')
    expect(html).not.toContain('ביטול')
  })
})
