import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { deliverInvite, sendInviteEmail } from '../../supabase/functions/_shared/inviteDelivery'

const LINK = 'https://yahpz.com/?set_password=1&type=invite&invite_token=tok-123'

function json(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
}

const env = { resendApiKey: 'resend-key', soprano: { user: 'u', password: 'p', source: 'YHPZ' } }
const invite = { to: 'dana@example.test', fullName: 'דנה', actionLink: LINK, phone: '0548654223' }
const hosts = (fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetchImpl.mock.calls.map(([url]) => new URL(String(url)).host)

function adminUsersSource(): string {
  return readFileSync(
    resolve(import.meta.dirname, '../../supabase/functions/admin-users/index.ts'),
    'utf8',
  )
}

function between(src: string, from: string, to: string): string {
  const start = src.indexOf(from)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf(to, start)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('invite email', () => {
  it('posts the invite to Resend with the link, name and sender', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{"id":"e1"}', { status: 200 }))
    const result = await sendInviteEmail('dana@example.test', 'דנה כהן', LINK, 'resend-key', fetchImpl)

    expect(result).toEqual({ error: null })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer resend-key',
      'Content-Type': 'application/json',
    })
    const body = json(init)
    expect(body.from).toBe('אבן דרך - יחפ״צ <invites@send.yahpz.com>')
    expect(body.to).toEqual(['dana@example.test'])
    expect(body.subject).toBe('הוזמנת למערכת אבן דרך - יחפ״צ')
    expect(body.text).toContain('שלום דנה כהן,')
    expect(body.text).toContain(LINK)
    expect(body.html).toContain(`href="${LINK}"`)
  })

  it('fails without calling Resend when the key is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const result = await sendInviteEmail('dana@example.test', 'דנה', LINK, undefined, fetchImpl)
    expect(result.error).toBe('חסר מפתח Resend בשרת. פנו למנהל המערכת.')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns the Resend error body when Resend refuses', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('{"name":"daily_quota_exceeded"}', { status: 429 }),
    )
    const result = await sendInviteEmail('dana@example.test', 'דנה', LINK, 'resend-key', fetchImpl)
    expect(result.error).toBe('שליחת ההזמנה בדוא״ל נכשלה. בדקו את החיבור ונסו שוב.')
    expect(result.detail).toContain('daily_quota_exceeded')
  })
})

describe('invite delivery', () => {
  it('sends only the email when sendSms is false: no Soprano or Twilio request', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }))
    const result = await deliverInvite({ ...invite, sendSms: false }, env, fetchImpl)

    expect(result).toEqual({ error: null, sms: 'off' })
    expect(hosts(fetchImpl)).toEqual(['api.resend.com'])
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).not.toMatch(/soprano|twilio/i)
    }
    expect(json(fetchImpl.mock.calls[0]![1]).to).toEqual(['dana@example.test'])
  })

  it('sends the email, then the SMS to 972…, when sendSms is true', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }))
    const result = await deliverInvite({ ...invite, sendSms: true }, env, fetchImpl)

    expect(result).toEqual({ error: null, sms: 'sent' })
    expect(hosts(fetchImpl)).toEqual(['api.resend.com', 'sec.soprano.co.il'])
    const sms = new URLSearchParams(String(fetchImpl.mock.calls[1]![1]?.body))
    expect(sms.get('destination')).toBe('972548654223')
  })

  it('sends no SMS when the email fails, even with sendSms true', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('quota', { status: 429 }))
    const result = await deliverInvite({ ...invite, sendSms: true }, env, fetchImpl)

    expect(result.error).toBe('שליחת ההזמנה בדוא״ל נכשלה. בדקו את החיבור ונסו שוב.')
    expect(hosts(fetchImpl)).toEqual(['api.resend.com'])
  })
})

describe('admin-users invite wiring', () => {
  it('invite: SMS only unless the request says send_sms: false, and the result is returned', () => {
    const handleInvite = adminUsersSource().slice(adminUsersSource().indexOf('async function handleInvite('))
    expect(handleInvite).toContain('sendSms: body.send_sms !== false')
    const ret = handleInvite.slice(handleInvite.indexOf('action_link: actionLink,'))
    expect(ret.slice(0, 120)).toContain('sms: delivery.sms,')
  })

  it('invite: saves the token, roles and cars before delivering', () => {
    const handleInvite = adminUsersSource().slice(adminUsersSource().indexOf('async function handleInvite('))
    const deliver = handleInvite.indexOf('await deliverInvite(')
    expect(deliver).toBeGreaterThan(-1)
    expect(handleInvite.indexOf('invite_token: inviteToken')).toBeLessThan(deliver)
    expect(handleInvite.indexOf('from("user_roles").insert')).toBeLessThan(deliver)
    expect(handleInvite.indexOf('from("vehicles").insert')).toBeLessThan(deliver)
  })

  it('resend still sends the email and the SMS, after saving the new token', () => {
    const src = adminUsersSource()
    const prepare = between(src, 'async function handlePrepareInviteLink', 'function inviteDeliveryEnv')
    const block = prepare.slice(prepare.indexOf('if (sendEmail)'))
    expect(block).toContain('await deliverInvite(')
    expect(block).toContain('sendSms: true')
    expect(prepare.indexOf('invite_token: inviteToken')).toBeLessThan(prepare.indexOf('if (sendEmail)'))
  })

  it('copy link reuses the current valid token; resend still issues a new one', () => {
    const prepare = between(adminUsersSource(), 'async function handlePrepareInviteLink', 'function inviteDeliveryEnv')
    const reuse = prepare.indexOf('reusableInviteToken(')
    const mint = prepare.indexOf('newInviteTokenRow()')
    expect(reuse).toBeGreaterThan(-1)
    expect(reuse).toBeLessThan(mint)
    expect(prepare.slice(reuse - 200, reuse)).toContain('!sendEmail')
  })

  it('set_password sends nothing', () => {
    const setPassword = between(adminUsersSource(), 'async function handleSetPassword', 'async function handleSetEmail')
    expect(setPassword).not.toMatch(/deliverInvite|sendInviteEmail|sendInviteSms/)
  })
})
