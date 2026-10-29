import { describe, expect, it, vi } from 'vitest'
import { sendInviteEmail } from '../../supabase/functions/_shared/inviteDelivery'

const LINK = 'https://yahpz.com/?set_password=1&type=invite&invite_token=tok-123'

function json(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
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
