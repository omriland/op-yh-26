import { describe, expect, it } from 'vitest'
import {
  FILL_MEDIA_IMAGE_MAX_BYTES,
  FILL_MEDIA_VIDEO_MAX_BYTES,
  canManageFillMedia,
  coveredDigits,
  fillMediaDbError,
  fillMediaSizeError,
  fillMediaStoragePath,
  isUuid,
  parseCaption,
  parseDimension,
  parsePendingLinks,
  parseSubject,
  parseTakenWhen,
  resolveOwnPlates,
} from '../../supabase/functions/_shared/fillMedia'

const EVENT = '11111111-1111-4111-8111-111111111111'
const MEDIA = '22222222-2222-4222-8222-222222222222'
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MY_ASSIGNMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTHER_ASSIGNMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('fill media type and size', () => {
  it('takes compressed JPEG photos up to 1.5 MB', () => {
    expect(fillMediaSizeError('image/jpeg', FILL_MEDIA_IMAGE_MAX_BYTES)).toBeNull()
    expect(fillMediaSizeError('image/jpeg', FILL_MEDIA_IMAGE_MAX_BYTES + 1)).toBe('too_large')
  })

  it('takes MP4, MOV and WebM videos up to 25 MB', () => {
    for (const type of ['video/mp4', 'video/quicktime', 'video/webm']) {
      expect(fillMediaSizeError(type, FILL_MEDIA_VIDEO_MAX_BYTES)).toBeNull()
      expect(fillMediaSizeError(type, FILL_MEDIA_VIDEO_MAX_BYTES + 1)).toBe('too_large')
    }
  })

  it('refuses other types, HEIC and PNG included (the browser converts them first)', () => {
    expect(fillMediaSizeError('image/heic', 100)).toBe('bad_type')
    expect(fillMediaSizeError('image/png', 100)).toBe('bad_type')
    expect(fillMediaSizeError('application/pdf', 100)).toBe('bad_type')
    expect(fillMediaSizeError(undefined, 100)).toBe('bad_type')
  })

  it('refuses empty or non-integer sizes', () => {
    expect(fillMediaSizeError('image/jpeg', 0)).toBe('bad_request')
    expect(fillMediaSizeError('image/jpeg', 1.5)).toBe('bad_request')
    expect(fillMediaSizeError('image/jpeg', '100')).toBe('bad_request')
  })
})

describe('fill media storage path', () => {
  it('lives in the event folder, named by media id and type', () => {
    expect(fillMediaStoragePath(EVENT, MEDIA, 'image/jpeg')).toBe(`${EVENT}/${MEDIA}.jpg`)
    expect(fillMediaStoragePath(EVENT, MEDIA, 'video/quicktime')).toBe(`${EVENT}/${MEDIA}.mov`)
  })

  it('only accepts uuid media ids', () => {
    expect(isUuid(MEDIA)).toBe(true)
    expect(isUuid('../other-event/x')).toBe(false)
    expect(isUuid(`${MEDIA}/../x`)).toBe(false)
    expect(isUuid(42)).toBe(false)
  })
})

describe('fill media fields', () => {
  it('reads taken-when as one of the two values', () => {
    expect(parseTakenWhen('before_treatment')).toBe('before_treatment')
    expect(parseTakenWhen('during_after_treatment')).toBe('during_after_treatment')
    expect(parseTakenWhen('later')).toBeNull()
  })

  it('trims captions, empties to null, and refuses over 200 characters', () => {
    expect(parseCaption('  שבר  ')).toEqual({ ok: true, caption: 'שבר' })
    expect(parseCaption('   ')).toEqual({ ok: true, caption: null })
    expect(parseCaption(null)).toEqual({ ok: true, caption: null })
    expect(parseCaption('א'.repeat(200))).toEqual({ ok: true, caption: 'א'.repeat(200) })
    expect(parseCaption('א'.repeat(201))).toEqual({ ok: false })
    expect(parseCaption(5)).toEqual({ ok: false })
  })

  it('reads the subject as sent, keeping only plate digits', () => {
    expect(parseSubject({ kind: 'unassigned' })).toEqual({ kind: 'unassigned' })
    expect(parseSubject({ kind: 'not_vehicle' })).toEqual({ kind: 'not_vehicle' })
    expect(parseSubject({ kind: 'vehicles', digits: ['12-345-67', '1234567', 'x'] })).toEqual({
      kind: 'vehicles',
      digits: ['1234567'],
    })
    expect(parseSubject({ kind: 'vehicles', digits: [] })).toEqual({ kind: 'unassigned' })
    expect(parseSubject({ kind: 'everything' })).toBeNull()
    expect(parseSubject(null)).toBeNull()
  })

  it('keeps sensible dimensions only', () => {
    expect(parseDimension(1600)).toBe(1600)
    expect(parseDimension(0)).toBeNull()
    expect(parseDimension(-5)).toBeNull()
    expect(parseDimension(1e9)).toBeNull()
    expect(parseDimension('1600')).toBeNull()
  })
})

describe('fill media scope', () => {
  it('lets the link manage only its responder’s photos on its event', () => {
    const scope = { eventId: EVENT, responderId: ME }
    expect(canManageFillMedia({ event_id: EVENT, uploaded_by: ME }, scope)).toBe(true)
    expect(canManageFillMedia({ event_id: EVENT, uploaded_by: OTHER }, scope)).toBe(false)
    expect(canManageFillMedia({ event_id: MEDIA, uploaded_by: ME }, scope)).toBe(false)
    expect(canManageFillMedia(null, scope)).toBe(false)
  })

  it('links photos only to the responder’s own report vehicles', () => {
    const plates = [
      { id: 'mine', plate_number: '12-345-67', event_responder_id: MY_ASSIGNMENT },
      { id: 'theirs', plate_number: '98-765-43', event_responder_id: OTHER_ASSIGNMENT },
      { id: 'shared', plate_number: '11-111-11', event_responder_id: null },
    ]
    expect(
      resolveOwnPlates(plates, ['1234567', '9876543', '1111111', '5555555'], MY_ASSIGNMENT),
    ).toEqual({ ids: ['mine'], missing: ['9876543', '1111111', '5555555'] })
  })

  it('reads pending links, dropping malformed ones', () => {
    expect(
      parsePendingLinks([
        { mediaId: MEDIA, digits: ['12-345-67', '1234567'] },
        { mediaId: 'nope', digits: ['1'] },
        { mediaId: MEDIA, digits: [] },
        null,
      ]),
    ).toEqual([{ mediaId: MEDIA, digits: ['1234567'] }])
    expect(parsePendingLinks('x')).toEqual([])
  })
})

describe('fill media coverage', () => {
  it('counts a plate number as covered when any photo on the event shows it', () => {
    const plates = [
      { id: 'p1', plate_number: '12-345-67' },
      { id: 'p2', plate_number: '98-765-43' },
      { id: 'p3', plate_number: '11-111-11' },
    ]
    const media = [{ treated_plate_ids: ['p1', 'p2'] }, { treated_plate_ids: [] }]
    expect(coveredDigits(media, plates).sort()).toEqual(['1234567', '9876543'])
  })

  it('ignores links to plate rows it cannot see', () => {
    expect(coveredDigits([{ treated_plate_ids: ['gone'] }], [])).toEqual([])
  })
})

describe('fill media database errors', () => {
  it('names the trigger or check that refused the write', () => {
    expect(fillMediaDbError('event_media_cap')).toBe('cap')
    expect(fillMediaDbError('event_cancelled')).toBe('cancelled')
    expect(fillMediaDbError('violates check constraint "event_media_type_and_size"')).toBe(
      'too_large',
    )
    expect(fillMediaDbError(undefined)).toBe('failed')
  })
})
