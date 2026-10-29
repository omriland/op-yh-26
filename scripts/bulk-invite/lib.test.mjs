import { describe, expect, it, vi } from 'vitest'
import { buildInvites, parseCsv, resultsCsv, runInvites } from './lib.mjs'

const HEADER_HE = 'שם מלא,דוא"ל,או"ק,טלפון,תפקיד,סטטוס'

describe('parseCsv', () => {
  it('reads an Excel "CSV UTF-8" export: BOM, CRLF, quotes', () => {
    const text = '﻿שם מלא,דוא"ל\r\n"כהן, דנה",dana@example.test\r\n"אומר ""היי""",x@example.test\r\n\r\n'
    expect(parseCsv(text)).toEqual([
      ['שם מלא', 'דוא"ל'],
      ['כהן, דנה', 'dana@example.test'],
      ['אומר "היי"', 'x@example.test'],
    ])
  })

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('buildInvites', () => {
  it('maps Hebrew headers, roles and statuses to the dialog body', () => {
    const rows = parseCsv(
      [
        HEADER_HE,
        'דנה כהן,Dana@Example.test,דמו-21,050-123-4567,מתנדבת,',
        'אבי לוי,avi@example.test,דמו-22,+972521234567,אחמ"ש,חניכה טלפונית',
        'רות מנהלת,ruth@example.test,דמו-23,0531234567,מנהל,מתנדב פעיל',
      ].join('\n'),
    )
    const { invites, errors } = buildInvites(rows)
    expect(errors).toEqual([])
    expect(invites.map((i) => i.body)).toEqual([
      { action: 'invite', full_name: 'דנה כהן', email: 'dana@example.test', callsign: 'דמו-21', phone: '0501234567', roles: ['responder'], vehicles: [] },
      { action: 'invite', full_name: 'אבי לוי', email: 'avi@example.test', callsign: 'דמו-22', phone: '0521234567', roles: ['shift_lead', 'responder'], volunteer_status: 'phone_training', vehicles: [] },
      { action: 'invite', full_name: 'רות מנהלת', email: 'ruth@example.test', callsign: 'דמו-23', phone: '0531234567', roles: ['admin', 'shift_lead', 'responder'], volunteer_status: 'active_volunteer', vehicles: [] },
    ])
    expect(invites.map((i) => i.line)).toEqual([2, 3, 4])
  })

  it('joins first and last name columns, and reads "שם" next to "שם משפחה" as a first name', () => {
    for (const header of ['שם פרטי,שם משפחה', 'שם,שם משפחה']) {
      const { invites, errors } = buildInvites(
        parseCsv(`${header},אימייל,או"ק,נייד\nדנה,כהן,d@example.test,ד-1,0501111111`),
      )
      expect(errors).toEqual([])
      expect(invites[0].body.full_name).toBe('דנה כהן')
    }
  })

  it('restores the leading 0 Excel drops from a numeric phone', () => {
    const { invites, errors } = buildInvites(parseCsv('שם מלא,דוא"ל,או"ק,טלפון\nא ב,a@example.test,T-1,501234567'))
    expect(errors).toEqual([])
    expect(invites[0].body.phone).toBe('0501234567')
  })

  it('accepts English headers and defaults the role to responder', () => {
    const { invites, errors } = buildInvites(parseCsv('full_name,email,callsign,phone\nA B,a@example.test,T-1,0501111111'))
    expect(errors).toEqual([])
    expect(invites[0].body.roles).toEqual(['responder'])
  })

  it('reports every problem and returns nothing to send', () => {
    const rows = parseCsv(
      [
        HEADER_HE,
        ',bad-email,,123,מנהל־על,סטטוס אחר',
        'א,a@example.test,T-1,0501111111,,',
        'ב,A@example.test,t-1,0502222222,,',
      ].join('\n'),
    )
    const { invites, errors } = buildInvites(rows)
    expect(errors).toEqual([
      'שורה 2: חסר שם מלא, דוא״ל לא תקין, חסר או״ק, טלפון חייב 10 ספרות, תפקיד לא מוכר: מנהל־על, סטטוס לא מוכר: סטטוס אחר',
      'שורה 4: דוא״ל כפול (שורה 3), או״ק כפול (שורה 3)',
    ])
    expect(invites).toHaveLength(1)
  })

  it('needs the four identity columns', () => {
    expect(buildInvites(parseCsv('שם מלא,תפקיד\nא,מתנדב')).errors).toEqual([
      'חסרה עמודה: email',
      'חסרה עמודה: callsign',
      'חסרה עמודה: phone',
    ])
    expect(buildInvites([]).errors).toHaveLength(1)
  })
})

describe('runInvites', () => {
  const invites = ['a', 'b', 'c', 'd'].map((x, i) => ({
    line: i + 2,
    body: { action: 'invite', email: `${x}@example.test` },
  }))
  const sleep = vi.fn(async () => {})

  it('sends one at a time, skips existing users, records row problems, and keeps going', async () => {
    const replies = [
      { status: 200, body: { ok: true } },
      { status: 409, body: { error: 'המשתמש כבר קיים במערכת.' } },
      { status: 409, body: { error: 'או״ק זה כבר בשימוש.' } },
      { status: 200, body: { ok: true } },
    ]
    const invoke = vi.fn(async () => replies.shift())
    const results = await runInvites({ invites, invoke, sleep, delayMs: 10 })
    expect(results.map((r) => r.outcome)).toEqual(['invited', 'exists', 'failed', 'invited'])
    expect(invoke).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledWith(10)
  })

  it.each([
    [429, { error: 'נשלחו יותר מדי הזמנות. נסו שוב בעוד כמה דקות.' }],
    [403, { error: 'אין לך הרשאה לפעולה זו.' }],
    [400, { error: 'שליחת ההזמנה בדוא״ל נכשלה. בדקו את החיבור ונסו שוב.' }],
    [500, { error: 'שמירת התפקידים נכשלה.' }],
  ])('stops the run on %i', async (status, body) => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { ok: true } })
      .mockResolvedValueOnce({ status, body })
    const results = await runInvites({ invites, invoke, sleep })
    expect(results.map((r) => r.outcome)).toEqual(['invited', 'stopped'])
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('stops on a network error', async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error('fetch failed'))
    const results = await runInvites({ invites, invoke, sleep })
    expect(results).toEqual([{ line: 2, email: 'a@example.test', outcome: 'stopped', status: 0, message: 'fetch failed' }])
  })

  it('honours --limit', async () => {
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true } }))
    await runInvites({ invites, invoke, sleep, limit: 2 })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('writes a results file Excel opens in Hebrew', () => {
    expect(resultsCsv([{ line: 2, email: 'a@example.test', outcome: 'failed', status: 409, message: 'או״ק "x"' }])).toBe(
      '﻿line,email,outcome,status,message\r\n2,"a@example.test",failed,409,"או״ק ""x"""\r\n',
    )
  })
})
