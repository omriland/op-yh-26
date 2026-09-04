import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
  'utf8',
)

function zIndexFor(selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*z-index:\\s*(\\d+)`))
  if (!match) throw new Error(`no z-index for ${selector}`)
  return Number(match[1])
}

describe('overlay stack', () => {
  it('keeps select menus above dialogs so they can open in the user edit form', () => {
    expect(zIndexFor('.select-field__menu')).toBeGreaterThan(zIndexFor('.dialog-root'))
  })

  it('keeps dialogs above the mobile tab bar once portaled to body', () => {
    expect(zIndexFor('.dialog-root')).toBeGreaterThan(zIndexFor('.tabbar'))
    expect(zIndexFor('.dialog-root')).toBeGreaterThan(zIndexFor('.appbar'))
  })
})
