import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SUPPORT_WHATSAPP_HREF } from './supportWhatsapp'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

describe('support WhatsApp', () => {
  it('keeps the wa.me link for the personal-vehicle request only', () => {
    expect(SUPPORT_WHATSAPP_HREF).toBe('https://wa.me/972548654223')
  })

  it('shows the support number nowhere on the site', () => {
    for (const path of [
      '../components/feedback/FeedbackFab.tsx',
      '../pages/SupportPage.tsx',
    ]) {
      const src = read(path)
      expect(src, path).not.toContain('SUPPORT_WHATSAPP')
      expect(src, path).not.toContain('054-865-4223')
    }
    expect(read('./supportWhatsapp.ts')).not.toContain('054-865-4223')
  })
})
