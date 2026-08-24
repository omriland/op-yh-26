import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './Dialog.tsx'), 'utf8')

describe('Dialog focus trap', () => {
  it('does not re-run initial focus when parent re-renders with a new onClose', () => {
    // Typing in a form dialog (e.g. משתמש חדש) recreates an inline onClose every
    // keystroke. If that identity is in the trap effect deps, focus jumps to X.
    expect(src).toContain('onCloseRef.current = onClose')
    expect(src).toMatch(/addEventListener\('keydown', onKeyDown, true\)[\s\S]*?\n  \}, \[open\]\)/)
    expect(src).not.toMatch(/\}, \[open, onClose\]\)/)
  })
})
