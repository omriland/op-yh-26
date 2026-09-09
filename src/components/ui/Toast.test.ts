import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './Toast.tsx'), 'utf8')

describe('Toast HeroUI Alert', () => {
  it('renders HeroUI Alert with forced RTL', () => {
    expect(src).toContain("import { Alert, CloseButton } from '@heroui/react'")
    expect(src).toContain('dir="rtl"')
    expect(src).toContain('data-theme="light"')
    expect(src).toContain('data-vibrant-palette="true"')
    expect(src).toContain('<Alert')
    expect(src).toContain('<Alert.Indicator')
    expect(src).toContain('<Alert.Title>')
    expect(src).toContain('aria-label="סגירה"')
  })

  it('keeps the public show(message, tone) API', () => {
    expect(src).toContain('show: (message: string, tone?: ToastTone) => void')
    expect(src).toContain("tone: ToastTone = 'done'")
    expect(src).toContain('formatToastMessage(message)')
  })
})
