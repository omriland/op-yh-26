import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(resolve(here, './AlertDialog.tsx'), 'utf8')
const islandCss = readFileSync(resolve(here, '../../styles/heroui-toast.css'), 'utf8')

describe('AlertDialog HeroUI wrapper', () => {
  it('uses HeroUI AlertDialog with forced RTL and locked placement/size', () => {
    expect(src).toContain("import { AlertDialog as HeroAlertDialog } from '@heroui/react'")
    expect(src).toContain('dir = \'rtl\'')
    expect(src).toContain('lang = \'he\'')
    expect(src).toContain("dir === 'rtl' ? 'yahpaz-alert-dialog--rtl' : 'yahpaz-alert-dialog--ltr'")
    expect(src).toContain('data-theme="light"')
    expect(src).toContain('data-vibrant-palette="true"')
    expect(src).toContain('placement="auto"')
    expect(src).toContain('size="md"')
    expect(src).toContain('<HeroAlertDialog.Icon status={status} />')
    expect(src).toContain('aria-label={closeLabel}')
  })

  it('keeps a controlled open/onClose API', () => {
    expect(src).toContain('isOpen={open}')
    expect(src).toContain('onClose()')
    expect(src).toContain('isDismissable={!busy}')
    expect(src).toContain('isKeyboardDismissDisabled={busy}')
  })

  it('loads tw-animate-css so Alert Dialog @apply fade-in-0 can compile', () => {
    expect(islandCss).toContain("@import 'tw-animate-css'")
    expect(islandCss).toContain("@import '@heroui/styles/components/alert-dialog.css'")
  })
})
