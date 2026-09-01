import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  applyStashedCreateUserDraft,
  canEditUserEmail,
  canSubmitCreateUser,
  clearCreateUserStash,
  createUserEmailError,
  emailsDiffer,
  readCreateUserStash,
  shouldStashCreateUserDraft,
  stashCreateUserDraft,
  userCreateStashId,
  userEmailFieldHint,
} from './adminUserDraft'

const complete = {
  full_name: 'דנה כהן',
  email: 'dana@example.com',
  callsign: 'D1',
  phone: '050-1234567',
}

const NOW = 1_787_000_000_000

function installStorage() {
  const map = new Map<string, string>()
  const store: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
  vi.stubGlobal('window', { localStorage: store })
  return map
}

describe('canSubmitCreateUser', () => {
  it('is true only when name, callsign, email, and a 10-digit phone are filled', () => {
    expect(canSubmitCreateUser(complete)).toBe(true)
  })

  it('is false when any required field is empty or whitespace', () => {
    expect(canSubmitCreateUser({ ...complete, full_name: '' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, full_name: '   ' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, callsign: '' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, callsign: '  ' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: '' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: '  ' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, phone: '' })).toBe(false)
  })

  it('is false when the phone is only partially filled', () => {
    expect(canSubmitCreateUser({ ...complete, phone: '050-123' })).toBe(false)
  })

  it('is false when the email is not a valid address', () => {
    expect(canSubmitCreateUser({ ...complete, email: 'not-an-email' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: 'dana@' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: 'dana@gmail' })).toBe(false)
  })
})

describe('createUserEmailError', () => {
  it('is silent while the field is empty', () => {
    expect(createUserEmailError('')).toBeNull()
    expect(createUserEmailError('   ')).toBeNull()
  })

  it('explains an invalid address while typing', () => {
    expect(createUserEmailError('dana')).toBe('יש להזין כתובת דוא״ל תקינה.')
    expect(createUserEmailError('dana@gmail')).toBe('יש להזין כתובת דוא״ל תקינה.')
  })

  it('is silent for a valid address', () => {
    expect(createUserEmailError('dana@example.com')).toBeNull()
    expect(createUserEmailError(' dana+tag@example.co.il ')).toBeNull()
  })
})

describe('canEditUserEmail', () => {
  it('is always true on create', () => {
    expect(canEditUserEmail(true, false)).toBe(true)
    expect(canEditUserEmail(true, true)).toBe(true)
  })

  it('is true for an existing user only when the actor is Super Admin', () => {
    expect(canEditUserEmail(false, true)).toBe(true)
    expect(canEditUserEmail(false, false)).toBe(false)
  })
})

describe('userEmailFieldHint', () => {
  it('explains invite on create and lock vs Super Admin change on edit', () => {
    expect(userEmailFieldHint(true, false)).toBe(
      'נשלחת הזמנה לכתובת זו. הקישור בתוקף ל־24 שעות.',
    )
    expect(userEmailFieldHint(false, false)).toBe('לא ניתן לשנות דוא״ל לאחר יצירה.')
    expect(userEmailFieldHint(false, true)).toBe('שינוי דוא״ל מעדכן גם את פרטי ההתחברות.')
  })
})

describe('emailsDiffer', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(emailsDiffer('Dana@Example.com', ' dana@example.com ')).toBe(false)
    expect(emailsDiffer('a@x.com', 'b@x.com')).toBe(true)
  })
})

describe('create-user local stash', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('keys the create draft per actor', () => {
    expect(userCreateStashId('a1')).toBe('a1:new')
    expect(userCreateStashId('a1')).not.toBe(userCreateStashId('a2'))
  })

  it('does not stash an empty create or an edit', () => {
    expect(
      shouldStashCreateUserDraft({
        full_name: '',
        email: '',
        callsign: '',
        phone: '',
        vehicles: [],
        addresses: [{ location: '' }],
      }),
    ).toBe(false)
    expect(shouldStashCreateUserDraft({ ...complete, id: 'u1' })).toBe(false)
  })

  it('stashes once a phone, name, or address is typed', () => {
    expect(
      shouldStashCreateUserDraft({
        full_name: '',
        email: '',
        callsign: '',
        phone: '050',
      }),
    ).toBe(true)
    expect(
      shouldStashCreateUserDraft({
        ...complete,
        phone: '',
        email: '',
        callsign: '',
        addresses: [{ location: 'הרצליה' }],
      }),
    ).toBe(true)
  })

  it('rejects an edit payload so create cannot open as someone else', () => {
    expect(
      applyStashedCreateUserDraft(
        { ...complete, full_name: '' },
        { ...complete, id: 'u9', full_name: 'אחר' },
      ),
    ).toBeNull()
  })

  it('round-trips a create draft and clears when it becomes empty', () => {
    installStorage()
    stashCreateUserDraft('admin', { ...complete, phone: '050-1' }, NOW)
    expect(readCreateUserStash<{ phone: string }>('admin', NOW)?.phone).toBe('050-1')
    stashCreateUserDraft(
      'admin',
      { full_name: '', email: '', callsign: '', phone: '' },
      NOW,
    )
    expect(readCreateUserStash('admin', NOW)).toBeNull()
    stashCreateUserDraft('admin', complete, NOW)
    clearCreateUserStash('admin')
    expect(readCreateUserStash('admin', NOW)).toBeNull()
  })
})
