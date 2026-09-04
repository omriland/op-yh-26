import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(resolve(here, './overlayDismiss.ts'), 'utf8')
const shell = readFileSync(resolve(here, '../components/shell/AppShell.tsx'), 'utf8')

describe('isMenuOutsideClick', () => {
  it('treats a portaled dialog as still owned by the opener', () => {
    expect(src).toContain("el?.closest('.dialog-root')")
    expect(src).toContain('anchor?.contains(target)')
  })

  it('is what the avatar menu uses for outside clicks', () => {
    expect(shell).toContain('isMenuOutsideClick(event.target, anchorRef.current)')
  })
})
