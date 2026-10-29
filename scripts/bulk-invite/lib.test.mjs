import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { buildInvites, buildVehicles, parseCsv, plateDigits, resultsCsv, runInvites, syncUserVehicles } from './lib.mjs'

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
      { status: 200, body: { ok: true, sms: 'off' } },
      { status: 409, body: { error: 'המשתמש כבר קיים במערכת.' } },
      { status: 409, body: { error: 'או״ק זה כבר בשימוש.' } },
      { status: 200, body: { ok: true, sms: 'off' } },
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
      .mockResolvedValueOnce({ status: 200, body: { ok: true, sms: 'off' } })
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
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true, sms: 'off' } }))
    await runInvites({ invites, invoke, sleep, limit: 2 })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('writes a results file Excel opens in Hebrew', () => {
    expect(resultsCsv([{ line: 2, email: 'a@example.test', outcome: 'failed', status: 409, message: 'או״ק "x"' }])).toBe(
      '﻿line,email,outcome,status,message,vehicles_added,vehicles_skipped,sms\r\n2,"a@example.test",failed,409,"או״ק ""x""",,,\r\n',
    )
  })
})

const VEH_HEADER = 'דוא"ל,מספר רכב,דגם,סוג,שורה מקורית'
const twoInvites = () =>
  buildInvites(
    parseCsv([HEADER_HE, 'דנה כהן,dana@example.test,דמו-21,0501234567,,', 'אבי לוי,avi@example.test,דמו-22,0521234567,,'].join('\n')),
  ).invites

describe('buildVehicles', () => {
  it('groups cars by email in file order and normalizes plates', () => {
    const rows = parseCsv(
      [VEH_HEADER, 'Dana@Example.test,12-345-67,GMC AT4,ראשי,2', 'dana@example.test,123.45.678 ,  טויוטה   היילקס ,משני,2', 'avi@example.test,7654321,ג׳יפ,ראשי,3'].join('\n'),
    )
    const { byEmail, errors } = buildVehicles(rows, twoInvites())
    expect(errors).toEqual([])
    expect(byEmail.get('dana@example.test')).toEqual([
      { plate_number: '1234567', model: 'GMC AT4' },
      { plate_number: '12345678', model: 'טויוטה היילקס' },
    ])
    expect(byEmail.get('avi@example.test')).toEqual([{ plate_number: '7654321', model: 'ג׳יפ' }])
  })

  it('rejects bad plates, missing models, unknown emails and any repeated plate', () => {
    const rows = parseCsv(
      [
        VEH_HEADER,
        'dana@example.test,1234567,GMC,ראשי,2',
        'dana@example.test,12-345-67,GMC,משני,2',
        'avi@example.test,1234567,GMC,ראשי,3',
        'avi@example.test,321115,ג׳יפ,משני,3',
        'avi@example.test,7654321,,משני,3',
        'nobody@example.test,7777777,GMC,ראשי,4',
      ].join('\n'),
    )
    const { errors } = buildVehicles(rows, twoInvites())
    expect(errors).toHaveLength(5)
    expect(errors[0]).toContain('רכב כפול לאותו אדם')
    expect(errors[1]).toContain('אותו רכב אצל שני אנשים')
    expect(errors[2]).toContain('7 או 8 ספרות')
    expect(errors[3]).toContain('חסר דגם')
    expect(errors[4]).toContain('לא ברשימת ההזמנות')
  })
})

describe('syncUserVehicles', () => {
  const fakeApi = (existing = []) => {
    const plates = [...existing]
    return {
      plates,
      findUserId: vi.fn(async () => 'u1'),
      listPlates: vi.fn(async () => [...plates]),
      insert: vi.fn(async (_id, v) => {
        plates.push(v.plate_number)
        return 'inserted'
      }),
    }
  }
  const cars = [
    { plate_number: '1234567', model: 'A' },
    { plate_number: '12345678', model: 'B' },
  ]

  it('inserts every car in order for a new user, without a lookup', async () => {
    const api = fakeApi()
    expect(await syncUserVehicles({ email: 'x', userId: 'new', vehicles: cars, api })).toEqual({ added: 2, skipped: 0 })
    expect(api.findUserId).not.toHaveBeenCalled()
    expect(api.insert.mock.calls.map((c) => c[1].plate_number)).toEqual(['1234567', '12345678'])
  })

  it('skips plates the user already has, whatever their format, so a re-run adds nothing twice', async () => {
    const api = fakeApi(['12-345-67'])
    expect(await syncUserVehicles({ email: 'x', userId: null, vehicles: cars, api })).toEqual({ added: 1, skipped: 1 })
    expect(await syncUserVehicles({ email: 'x', userId: null, vehicles: cars, api })).toEqual({ added: 0, skipped: 2 })
    expect(api.insert).toHaveBeenCalledTimes(1)
  })

  it('throws when the user cannot be found', async () => {
    const api = { ...fakeApi(), findUserId: async () => null }
    await expect(syncUserVehicles({ email: 'x', userId: null, vehicles: cars, api })).rejects.toThrow('לא נמצא')
  })

  it('plateDigits strips spaces, dashes and dots only', () => {
    expect(plateDigits(' 12-345.67 ')).toBe('1234567')
  })
})

describe('runInvites with vehicles', () => {
  const invites = twoInvites()
  const byEmail = new Map([['dana@example.test', [{ plate_number: '1234567', model: 'A' }]]])

  it('adds cars after invited and exists, passes the new user id, and skips members without cars', async () => {
    const syncVehicles = vi.fn(async () => ({ added: 1, skipped: 0 }))
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'new-id', sms: 'off' } }))
    const results = await runInvites({ invites, invoke, delayMs: 0, sleep: async () => {}, vehiclesByEmail: byEmail, syncVehicles })
    expect(syncVehicles).toHaveBeenCalledTimes(1)
    expect(syncVehicles.mock.calls[0][0]).toMatchObject({ email: 'dana@example.test', userId: 'new-id' })
    expect(results[0]).toMatchObject({ outcome: 'invited', vehicles_added: 1, vehicles_skipped: 0 })
    expect(results[1].vehicles_added).toBeUndefined()

    const exists = vi.fn(async () => ({ status: 409, body: { error: 'המשתמש כבר קיים במערכת.' } }))
    await runInvites({ invites, invoke: exists, delayMs: 0, sleep: async () => {}, vehiclesByEmail: byEmail, syncVehicles })
    expect(syncVehicles.mock.calls[1][0]).toMatchObject({ email: 'dana@example.test', userId: null })
  })

  it('stops the run when the car step fails', async () => {
    const syncVehicles = vi.fn(async () => {
      throw new Error('הוספת רכב נכשל (403 42501)')
    })
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'id', sms: 'off' } }))
    const results = await runInvites({ invites, invoke, delayMs: 0, sleep: async () => {}, vehiclesByEmail: byEmail, syncVehicles })
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('stopped')
    expect(results[0].message).toContain('רכבים')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('does not touch cars for a failed row', async () => {
    const syncVehicles = vi.fn()
    const invoke = vi.fn(async () => ({ status: 409, body: { error: 'או״ק זה כבר בשימוש.' } }))
    await runInvites({ invites, invoke, delayMs: 0, sleep: async () => {}, vehiclesByEmail: byEmail, syncVehicles })
    expect(syncVehicles).not.toHaveBeenCalled()
  })
})

describe('buildVehicles shared cars', () => {
  const H = 'דוא"ל,מספר רכב,דגם,סוג,שורה מקורית,משותף'
  it('allows one plate under two people when every row is marked shared, in each person\'s own order', () => {
    const rows = parseCsv([H, 'dana@example.test,1234567,A,ראשי,2,כן', 'dana@example.test,7654321,B,משני,2,כן', 'avi@example.test,7654321,B2,ראשי,3,כן', 'avi@example.test,1234567,A2,משני,3,כן'].join('\n'))
    const { byEmail, errors } = buildVehicles(rows, twoInvites())
    expect(errors).toEqual([])
    expect(byEmail.get('dana@example.test').map((v) => v.plate_number)).toEqual(['1234567', '7654321'])
    expect(byEmail.get('avi@example.test').map((v) => v.plate_number)).toEqual(['7654321', '1234567'])
  })
  it('still rejects a cross-person repeat when any row is not marked, and a per-person repeat even if marked', () => {
    const rows = parseCsv([H, 'dana@example.test,1234567,A,ראשי,2,כן', 'avi@example.test,1234567,A,ראשי,3,', 'avi@example.test,7654321,B,ראשי,3,כן', 'avi@example.test,76-543-21,B,משני,3,כן'].join('\n'))
    const { errors } = buildVehicles(rows, twoInvites())
    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain('אותו רכב אצל שני אנשים')
    expect(errors[1]).toContain('רכב כפול לאותו אדם')
  })
})

describe('runInvites with SMS turned on (--sms)', () => {
  const invites = twoInvites()
  it('records the SMS result and stops on the first SMS failure', async () => {
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'id', sms: 'failed' } }))
    const results = await runInvites({ invites, invoke, delayMs: 0, sleep: async () => {}, sendSms: true })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ outcome: 'stopped', sms: 'failed' })
    expect(results[0].message).toContain('SMS נכשל')
  })
  it('goes on when SMS is sent, or when told to ignore SMS failures', async () => {
    const sent = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'id', sms: 'sent' } }))
    expect((await runInvites({ invites, invoke: sent, delayMs: 0, sleep: async () => {}, sendSms: true })).map((r) => r.outcome)).toEqual(['invited', 'invited'])
    expect(sent.mock.calls.map(([body]) => body.send_sms)).toEqual([true, true])
    const failed = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'id', sms: 'failed' } }))
    const r = await runInvites({ invites, invoke: failed, delayMs: 0, sleep: async () => {}, sendSms: true, stopOnSmsFailure: false })
    expect(r.map((x) => x.outcome)).toEqual(['invited', 'invited'])
  })
})

describe('runInvites is email-only unless sendSms is set', () => {
  const invites = twoInvites()
  const quiet = { delayMs: 0, sleep: async () => {} }

  it('asks admin-users for no SMS, records sms off, and keeps going', async () => {
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'id', sms: 'off' } }))
    const results = await runInvites({ invites, invoke, ...quiet })
    expect(invoke.mock.calls.map(([body]) => body.send_sms)).toEqual([false, false])
    expect(results.map((r) => [r.outcome, r.sms])).toEqual([['invited', 'off'], ['invited', 'off']])
    expect(resultsCsv(results)).toContain(',off\r\n')
  })

  it('stops after the first row when admin-users ignores send_sms (not deployed yet)', async () => {
    const invoke = vi.fn(async () => ({ status: 200, body: { ok: true, user_id: 'id' } }))
    const results = await runInvites({ invites, invoke, ...quiet })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('stopped')
    expect(results[0].message).toContain('send_sms')
  })

  it('does not apply that check to existing users (no invite, nothing sent)', async () => {
    const invoke = vi.fn(async () => ({ status: 409, body: { error: 'המשתמש כבר קיים במערכת.' } }))
    const results = await runInvites({ invites, invoke, ...quiet })
    expect(results.map((r) => r.outcome)).toEqual(['exists', 'exists'])
  })
})

describe('bulk-invite.mjs dry run (no network: it exits before signing in)', () => {
  const script = fileURLToPath(new URL('./bulk-invite.mjs', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'bulk-invite-test-'))
  const csv = join(dir, 'members.csv')
  writeFileSync(csv, `${HEADER_HE}\nדנה כהן,dana@example.test,101,0501234567,מתנדב,\n`)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const run = (...args) =>
    spawnSync(process.execPath, [script, csv, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } })

  it('says SMS is off by default', () => {
    const out = run()
    expect(out.status).toBe(0)
    expect(out.stdout).toContain('SMS: off')
    expect(out.stdout).toContain('Dry run: nothing sent.')
  })

  it('says SMS is on with --sms', () => {
    const out = run('--sms')
    expect(out.status).toBe(0)
    expect(out.stdout).toContain('SMS: ON')
  })

  it('accepts --no-sms and refuses --sms with --no-sms', () => {
    expect(run('--no-sms').stdout).toContain('SMS: off')
    const both = run('--sms', '--no-sms')
    expect(both.status).toBe(1)
    expect(both.stderr).toContain('--sms')
  })
})
