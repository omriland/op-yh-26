import { describe, expect, it } from 'vitest'
import {
  DELETE_ACCOUNT_FAILED,
  canDeleteOwnAccount,
  parseDeleteAccountResponse,
} from './deleteAccount'

describe('canDeleteOwnAccount', () => {
  it('is offered on the member’s own, ordinary session', () => {
    expect(canDeleteOwnAccount({ impersonating: false, previewingRole: false })).toBe(true)
  })

  it('is hidden while viewing as another member or previewing a role', () => {
    expect(canDeleteOwnAccount({ impersonating: true, previewingRole: false })).toBe(false)
    expect(canDeleteOwnAccount({ impersonating: false, previewingRole: true })).toBe(false)
  })
})

describe('parseDeleteAccountResponse', () => {
  it('reads a real deletion', () => {
    expect(parseDeleteAccountResponse({ ok: true, status: 'deleted' }, null)).toEqual({ ok: true, simulated: false })
  })

  it('reads the App Review demo’s simulated deletion', () => {
    expect(parseDeleteAccountResponse({ ok: true, status: 'simulated' }, null)).toEqual({ ok: true, simulated: true })
  })

  it('shows the server’s refusal text', () => {
    expect(
      parseDeleteAccountResponse(null, { error: 'זהו המנהל האחרון ביחידה. יש למנות מנהל נוסף לפני מחיקת החשבון.' }),
    ).toEqual({ ok: false, error: 'זהו המנהל האחרון ביחידה. יש למנות מנהל נוסף לפני מחיקת החשבון.' })
  })

  it('falls back to a generic failure for anything unexpected', () => {
    expect(parseDeleteAccountResponse(null, null)).toEqual({ ok: false, error: DELETE_ACCOUNT_FAILED })
    expect(parseDeleteAccountResponse({ ok: true, status: 'weird' }, null)).toEqual({ ok: false, error: DELETE_ACCOUNT_FAILED })
    expect(parseDeleteAccountResponse('nope', { error: 42 })).toEqual({ ok: false, error: DELETE_ACCOUNT_FAILED })
  })
})
