import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

function read(name: string) {
  return readFileSync(resolve(here, name), 'utf8')
}

describe('FieldLabel required mark', () => {
  it('shows a red asterisk and keeps the hidden שדה חובה text', () => {
    const source = read('FieldLabel.tsx')
    expect(source).toContain('field__required')
    expect(source).toContain('*')
    expect(source).toContain('שדה חובה')
    expect(source).toContain('aria-hidden')
  })

  it('is the shared label on every form field', () => {
    for (const file of ['TextField.tsx', 'TextAreaField.tsx', 'SelectField.tsx', 'TimeField.tsx']) {
      expect(read(file)).toContain("from './FieldLabel'")
      expect(read(file)).toContain('<FieldLabel')
    }
    expect(readFileSync(resolve(here, '../events/LocationPlacesField.tsx'), 'utf8')).toContain(
      '<FieldLabel',
    )
  })
})
