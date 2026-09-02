import { describe, expect, it } from 'vitest'
import { authAdminUserUpdated, parseAdminUsersInvokeResult } from './adminUsersInvoke'

describe('parseAdminUsersInvokeResult', () => {
  it('treats a missing payload as failure instead of a fake success', () => {
    expect(parseAdminUsersInvokeResult(null, null)).toEqual({
      ok: false,
      error: 'הפעולה נכשלה. בדקו את החיבור ונסו שוב.',
    })
  })

  it('returns the server error message', () => {
    expect(parseAdminUsersInvokeResult({ error: 'אין הרשאה לביצוע פעולה זו.' }, null)).toEqual({
      ok: false,
      error: 'אין הרשאה לביצוע פעולה זו.',
    })
  })

  it('returns success fields when the function reports ok', () => {
    expect(
      parseAdminUsersInvokeResult(
        { ok: true, message: 'הסיסמה עודכנה.', user_id: 'abc' },
        null,
      ),
    ).toEqual({
      ok: true,
      message: 'הסיסמה עודכנה.',
      user_id: 'abc',
      action_link: undefined,
    })
  })
})

describe('authAdminUserUpdated', () => {
  it('is false when Auth returns no user even without an error object', () => {
    expect(authAdminUserUpdated({ data: { user: null }, error: null })).toBe(false)
  })

  it('is true only when Auth returns the updated user', () => {
    expect(
      authAdminUserUpdated({
        data: { user: { id: 'bbcae35d-7fee-4949-b9b2-5812ea4f4d4c' } },
        error: null,
      }),
    ).toBe(true)
  })
})
