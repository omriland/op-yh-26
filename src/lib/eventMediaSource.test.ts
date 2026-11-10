import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const uploadToSignedUrl = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {},
  supabaseAnon: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    storage: { from: () => ({ uploadToSignedUrl: (...args: unknown[]) => uploadToSignedUrl(...args) }) },
  },
}))

const { fillMediaErrorMessage, tokenMediaSource } = await import('./eventMediaSource')
const { EVENT_MEDIA_CAP_ERROR, EVENT_MEDIA_NETWORK, EVENT_MEDIA_VIDEO_TOO_LARGE, EVENT_MEDIA_TOO_LARGE } =
  await import('./eventMedia')

function failWith(code: string) {
  return {
    data: null,
    error: { context: new Response(JSON.stringify({ code }), { status: 400 }) },
  }
}

beforeEach(() => {
  invoke.mockReset()
  uploadToSignedUrl.mockReset()
})

describe('token media source', () => {
  it('uploads through a signed URL, then saves the row with the subject', async () => {
    invoke
      .mockResolvedValueOnce({ data: { media_id: 'm1', path: 'e1/m1.jpg', token: 't' }, error: null })
      .mockResolvedValueOnce({
        data: { media: { id: 'm1', treated_plate_ids: [] }, pending_digits: ['1234567'] },
        error: null,
      })
    uploadToSignedUrl.mockResolvedValue({ error: null })
    const blob = new Blob(['x'], { type: 'image/jpeg' })

    const result = await tokenMediaSource('tok').upload({
      eventId: 'e1',
      blob,
      mimeType: 'image/jpeg',
      width: 10,
      height: 20,
      takenWhen: 'before_treatment',
      subject: { kind: 'vehicles', digits: ['1234567'] },
      owner: { eventResponderId: 'someone-else' },
      caption: '  ',
    })

    expect(result).toEqual({
      ok: true,
      media: { id: 'm1', treated_plate_ids: [] },
      pendingDigits: ['1234567'],
    })
    expect(invoke.mock.calls[0]![1].body).toEqual({
      action: 'media_upload_url',
      fill_token: 'tok',
      mime_type: 'image/jpeg',
      byte_size: 1,
    })
    expect(uploadToSignedUrl).toHaveBeenCalledWith('e1/m1.jpg', 't', blob, { contentType: 'image/jpeg' })
    const create = invoke.mock.calls[1]![1].body
    expect(create).toMatchObject({
      action: 'media_create',
      fill_token: 'tok',
      media_id: 'm1',
      caption: null,
      subject: { kind: 'vehicles', digits: ['1234567'] },
    })
    // The server decides whose vehicles a photo may link to; the client never says.
    expect(create).not.toHaveProperty('owner')
  })

  it('stops before uploading when the event is full', async () => {
    invoke.mockResolvedValueOnce(failWith('cap'))
    const result = await tokenMediaSource('tok').upload({
      eventId: 'e1',
      blob: new Blob(['x']),
      mimeType: 'image/jpeg',
      width: null,
      height: null,
      takenWhen: 'before_treatment',
      subject: { kind: 'unassigned' },
      owner: null,
      caption: null,
    })
    expect(result).toEqual({ ok: false, error: EVENT_MEDIA_CAP_ERROR })
    expect(uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('returns coverage as a set of plate digits', async () => {
    invoke.mockResolvedValueOnce({ data: { covered: ['1234567'] }, error: null })
    expect(await tokenMediaSource('tok').coverage('e1')).toEqual(new Set(['1234567']))
  })

  it('returns null coverage when it could not be read, so no vehicle is named', async () => {
    invoke.mockResolvedValueOnce(failWith('failed'))
    expect(await tokenMediaSource('tok').coverage('e1')).toBeNull()
    invoke.mockRejectedValueOnce(new Error('offline'))
    expect(await tokenMediaSource('tok').coverage('e1')).toBeNull()
  })

  it('keeps every pending link waiting when linking fails', async () => {
    const links = [{ mediaId: 'm1', digits: ['1234567'] }]
    invoke.mockResolvedValueOnce(failWith('failed'))
    expect(await tokenMediaSource('tok').linkPending('e1', links, null)).toEqual(links)
  })

  it('skips the call when nothing is pending', async () => {
    expect(await tokenMediaSource('tok').linkPending('e1', [], null)).toEqual([])
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('fill media error copy', () => {
  it('reuses the gallery’s words', () => {
    expect(fillMediaErrorMessage('cap')).toBe(EVENT_MEDIA_CAP_ERROR)
    expect(fillMediaErrorMessage('too_large', 'video/mp4')).toBe(EVENT_MEDIA_VIDEO_TOO_LARGE)
    expect(fillMediaErrorMessage('too_large', 'image/jpeg')).toBe(EVENT_MEDIA_TOO_LARGE)
    expect(fillMediaErrorMessage(null)).toBe(EVENT_MEDIA_NETWORK)
  })
})
