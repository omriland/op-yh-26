import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  INVITE_SMS_BODY,
  redactProviderBody,
  sendInviteSms,
  sopranoBodyLooksFailed,
} from '../../supabase/functions/_shared/inviteSms'

const BODY =
  "הוזמנת למערכת 'אבן דרך'. פרטי התחברות ראשוניים מופיעים בתיבת המייל שלך"

const env = { user: 'soprano-user', password: 'soprano-pass', source: 'Konenut TLV' }

function form(init: RequestInit | undefined): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ''))
}

describe('invite SMS', () => {
  it('uses the exact invite sentence and nothing else', () => {
    expect(INVITE_SMS_BODY).toBe(BODY)
    expect(INVITE_SMS_BODY).not.toMatch(/https?:/i)
    expect(INVITE_SMS_BODY).not.toMatch(/סיסמ/)
  })

  it('posts that sentence to Soprano for an Israeli mobile', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }))
    const result = await sendInviteSms('050-1234567', env, fetchImpl)

    expect(result).toBe('sent')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://sec.soprano.co.il/')
    expect(init?.method).toBe('POST')
    const params = form(init)
    expect(params.get('operation')).toBe('mt')
    expect(params.get('message')).toBe(BODY)
    expect(params.get('destination')).toBe('972501234567')
    expect(params.get('user')).toBe('soprano-user')
    expect(params.get('password')).toBe('soprano-pass')
    expect(params.get('source')).toBe('Konenut TLV')
  })

  it('skips a missing or unusable phone without calling Soprano', async () => {
    const fetchImpl = vi.fn()
    expect(await sendInviteSms(null, env, fetchImpl)).toBe('skipped')
    expect(await sendInviteSms('', env, fetchImpl)).toBe('skipped')
    expect(await sendInviteSms('050-123', env, fetchImpl)).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not throw when Soprano is missing, errors, or rejects', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 500 }))
    expect(await sendInviteSms('0501234567', { user: '', password: 'x' }, fetchImpl)).toBe(
      'failed',
    )
    expect(fetchImpl).not.toHaveBeenCalled()

    expect(await sendInviteSms('0501234567', env, fetchImpl)).toBe('failed')
    fetchImpl.mockRejectedValueOnce(new Error('network'))
    expect(await sendInviteSms('0501234567', env, fetchImpl)).toBe('failed')
  })

  it('fires only after the initial-login invite email, including resend', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '../../supabase/functions/admin-users/index.ts'),
      'utf8',
    )
    expect(src).toContain('from "../_shared/inviteSms.ts"')

    const invite = src.slice(src.indexOf('async function handleInvite'), src.length)
    const inviteMail = invite.indexOf('const mail = await sendInviteEmail')
    const inviteSms = invite.indexOf('await sendInviteSmsBestEffort(phone)')
    expect(inviteMail).toBeGreaterThan(-1)
    expect(inviteSms).toBeGreaterThan(inviteMail)

    const prepare = src.slice(
      src.indexOf('async function handlePrepareInviteLink'),
      src.indexOf('async function sendInviteEmail'),
    )
    const emailBlock = prepare.slice(prepare.indexOf('if (sendEmail)'))
    expect(emailBlock).toContain('await sendInviteEmail')
    expect(emailBlock.indexOf('await sendInviteSmsBestEffort')).toBeGreaterThan(
      emailBlock.indexOf('if (mail.error)'),
    )
    expect(prepare.slice(0, prepare.indexOf('if (sendEmail)'))).not.toContain(
      'sendInviteSmsBestEffort',
    )

    const setPassword = src.slice(
      src.indexOf('async function handleSetPassword'),
      src.indexOf('async function handleSetEmail'),
    )
    expect(setPassword).not.toContain('sendInviteSms')
    expect(setPassword).not.toContain('sendInviteEmail')
  })

  it('treats a Soprano HTTP 200 whose body is an error or empty as failed', async () => {
    for (const body of ['', 'Error: invalid source', '<result><status>error</status></result>', 'שגיאה בשולח']) {
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response(body, { status: 200 }))
      expect(await sendInviteSms('0501234567', env, fetchImpl)).toBe('failed')
    }
    expect(sopranoBodyLooksFailed('ok')).toBe(false)
  })

  it('redacts phone numbers and credentials from logged bodies', () => {
    const out = redactProviderBody('user=abc&password=secret dest 972501234567 status 100')
    expect(out).not.toContain('secret')
    expect(out).not.toContain('abc')
    expect(out).not.toContain('972501234567')
  })

  it('sends through the Twilio Messaging Service when INVITE_SMS_PROVIDER=twilio', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ sid: 'SM123' }), { status: 201 }))
    const twilio = { accountSid: 'AC1', apiKey: 'k', apiSecret: 's', messagingServiceSid: 'MG1' }
    expect(await sendInviteSms('050-1234567', { ...env, provider: 'twilio', twilio }, fetchImpl)).toBe('sent')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json')
    const params = form(init)
    expect(params.get('To')).toBe('+972501234567')
    expect(params.get('MessagingServiceSid')).toBe('MG1')
    expect(params.get('Body')).toBe(BODY)

    const noSid = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }))
    expect(await sendInviteSms('0501234567', { provider: 'twilio', twilio }, noSid)).toBe('failed')
    expect(await sendInviteSms('0501234567', { provider: 'twilio' }, noSid)).toBe('failed')
  })

  it('returns the SMS result in the invite response', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '../../supabase/functions/admin-users/index.ts'),
      'utf8',
    )
    const invite = src.slice(src.indexOf('async function handleInvite'))
    expect(invite).toContain('const sms = await sendInviteSmsBestEffort(phone)')
    const ret = invite.slice(invite.indexOf('action_link: actionLink,'))
    expect(ret.slice(0, 120)).toContain('sms,')
  })

  it('saves the invite token and roles before emailing, so a failed email can be resent', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '../../supabase/functions/admin-users/index.ts'),
      'utf8',
    )
    const invite = src.slice(src.indexOf('async function handleInvite'))
    const mail = invite.indexOf('const mail = await sendInviteEmail')
    expect(invite.indexOf('invite_token: inviteToken')).toBeGreaterThan(-1)
    expect(invite.indexOf('invite_token: inviteToken')).toBeLessThan(mail)
    expect(invite.indexOf('from("user_roles").insert')).toBeLessThan(mail)
    expect(invite.indexOf('from("vehicles").insert')).toBeLessThan(mail)
  })
})

