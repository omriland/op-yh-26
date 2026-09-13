import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LedgerRow } from './Ledger'

describe('LedgerRow missing lead field', () => {
  it('marks an empty required field in alert red', () => {
    const html = renderToStaticMarkup(
      createElement(LedgerRow, { label: 'זמן סיום', missing: true }),
    )
    expect(html).toContain('ledger__row--missing')
    expect(html).toContain('זמן סיום, חסר')
    expect(html).toContain('—')
  })

  it('does not mark a filled field', () => {
    const html = renderToStaticMarkup(
      createElement(LedgerRow, { label: 'זמן סיום', value: '10:13' }),
    )
    expect(html).not.toContain('ledger__row--missing')
  })
})
