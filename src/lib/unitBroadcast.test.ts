import { describe, expect, it } from 'vitest'
import {
  broadcastAudienceLabel,
  broadcastChannelLabel,
  needsBroadcastSubject,
  previewUnitBroadcast,
  unitBroadcastConfirmCopy,
  unitBroadcastResultCopy,
  validateUnitBroadcastDraft,
  type BroadcastCandidate,
} from './unitBroadcast'

function user(partial: Partial<BroadcastCandidate> & Pick<BroadcastCandidate, 'id'>): BroadcastCandidate {
  return {
    email: 'a@example.com',
    phone: '0501234567',
    roles: ['responder'],
    active: true,
    invite_pending: false,
    ...partial,
  }
}

const roster: BroadcastCandidate[] = [
  user({ id: 'r1', roles: ['responder'] }),
  user({ id: 'r2', roles: ['responder'], phone: null }),
  user({ id: 'a1', roles: ['admin'], email: 'admin@example.com' }),
  user({ id: 'l1', roles: ['shift_lead'] }),
  user({ id: 'both', roles: ['admin', 'shift_lead'] }),
  user({ id: 'pending', invite_pending: true }),
  user({ id: 'inactive', active: false }),
]

describe('previewUnitBroadcast', () => {
  it('counts only active confirmed users for the all-users audience', () => {
    const preview = previewUnitBroadcast(roster, { channel: 'email', audience: 'all' })
    expect(preview.audienceCount).toBe(5)
    expect(preview.recipientCount).toBe(5)
    expect(preview.emailCount).toBe(5)
    expect(preview.skippedNoEmail).toBe(0)
    expect(preview.canSend).toBe(true)
  })

  it('includes combo admin+lead in both role audiences, once each', () => {
    expect(previewUnitBroadcast(roster, { channel: 'email', audience: 'admins' }).audienceCount).toBe(2)
    expect(
      previewUnitBroadcast(roster, { channel: 'email', audience: 'shift_leads' }).audienceCount,
    ).toBe(2)
  })

  it('skips invalid phones on SMS and still emails them when both', () => {
    const sms = previewUnitBroadcast(roster, { channel: 'sms', audience: 'all' })
    expect(sms.smsCount).toBe(4)
    expect(sms.skippedNoPhone).toBe(1)
    expect(sms.recipientCount).toBe(4)

    const both = previewUnitBroadcast(roster, { channel: 'both', audience: 'all' })
    expect(both.emailCount).toBe(5)
    expect(both.smsCount).toBe(4)
    expect(both.skippedNoPhone).toBe(1)
    expect(both.recipientCount).toBe(5)
  })

  it('blocks send when nobody can receive the chosen channel', () => {
    const noPhones = [user({ id: 'x', phone: '0411111111' })]
    const preview = previewUnitBroadcast(noPhones, { channel: 'sms', audience: 'all' })
    expect(preview.recipientCount).toBe(0)
    expect(preview.canSend).toBe(false)
  })
})

describe('unitBroadcastConfirmCopy', () => {
  it('names channel, count, and skipped phones', () => {
    const preview = previewUnitBroadcast(roster, { channel: 'both', audience: 'all' })
    expect(unitBroadcastConfirmCopy(preview, { channel: 'both', audience: 'all' })).toBe(
      'יישלח ל־5 משתמשים פעילים (SMS + אימייל). 1 בלי טלפון ידולגו. לשלוח?',
    )
  })

  it('uses the role audience noun and omits skip line when none', () => {
    const preview = previewUnitBroadcast(roster, { channel: 'email', audience: 'admins' })
    expect(unitBroadcastConfirmCopy(preview, { channel: 'email', audience: 'admins' })).toBe(
      'יישלח ל־2 מנהלים פעילים (אימייל). לשלוח?',
    )
  })

  it('explains an empty send', () => {
    const preview = previewUnitBroadcast([], { channel: 'sms', audience: 'shift_leads' })
    expect(unitBroadcastConfirmCopy(preview, { channel: 'sms', audience: 'shift_leads' })).toBe(
      'אין נמענים לשליחה בקהל ובערוץ שנבחרו.',
    )
  })
})

describe('validateUnitBroadcastDraft', () => {
  it('requires a body always and a subject when email is included', () => {
    expect(validateUnitBroadcastDraft({ channel: 'sms', subject: '', body: '' })).toEqual({
      body: 'יש למלא את תוכן ההודעה.',
    })
    expect(validateUnitBroadcastDraft({ channel: 'email', subject: '  ', body: 'שלום' })).toEqual({
      subject: 'יש למלא נושא לדוא״ל.',
    })
    expect(validateUnitBroadcastDraft({ channel: 'both', subject: 'נושא', body: 'גוף' })).toEqual({})
  })

  it('rejects oversized subject and body', () => {
    expect(
      validateUnitBroadcastDraft({
        channel: 'email',
        subject: 'א'.repeat(201),
        body: 'גוף',
      }).subject,
    ).toBe('הנושא ארוך מדי.')
    expect(
      validateUnitBroadcastDraft({
        channel: 'sms',
        subject: '',
        body: 'א'.repeat(2001),
      }).body,
    ).toBe('ההודעה ארוכה מדי.')
  })
})

describe('unitBroadcastResultCopy', () => {
  it('reports sent, skipped, and failed counts', () => {
    expect(
      unitBroadcastResultCopy({
        recipientCount: 5,
        skippedNoPhone: 1,
        skippedNoEmail: 0,
        failedCount: 0,
      }),
    ).toBe('נשלח ל־5. 1 בלי טלפון דולגו.')
    expect(
      unitBroadcastResultCopy({
        recipientCount: 2,
        skippedNoPhone: 0,
        skippedNoEmail: 0,
        failedCount: 2,
      }),
    ).toBe('נשלח ל־2. 2 נכשלו.')
  })
})

describe('broadcast labels', () => {
  it('hides subject for SMS-only and labels log values in Hebrew', () => {
    expect(needsBroadcastSubject('sms')).toBe(false)
    expect(needsBroadcastSubject('email')).toBe(true)
    expect(needsBroadcastSubject('both')).toBe(true)
    expect(broadcastChannelLabel('both')).toBe('SMS + אימייל')
    expect(broadcastAudienceLabel('shift_leads')).toBe('אחמ״שים')
    expect(broadcastAudienceLabel('all')).toBe('כלל המשתמשים')
    expect(broadcastAudienceLabel('admins')).toBe('מנהלים')
  })
})
