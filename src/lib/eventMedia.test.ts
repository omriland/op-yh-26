import { describe, expect, it } from 'vitest'
import {
  EVENT_MEDIA_CAP,
  EVENT_MEDIA_CAP_ERROR,
  EVENT_MEDIA_CAPTION_ERROR,
  EVENT_MEDIA_LEFTOVER_ERROR,
  EVENT_MEDIA_NETWORK,
  canAddMoreMedia,
  captionError,
  eventMediaStoragePath,
  groupMediaByTakenWhen,
  leftoverEventMediaError,
  mapEventMediaError,
  mergeMediaPlates,
  slotsRemaining,
  type EventMedia,
} from './eventMedia'

function media(patch: Partial<EventMedia> = {}): EventMedia {
  return {
    id: 'm1',
    event_id: 'e1',
    uploaded_by: 'u1',
    uploader_name: 'דנה',
    treated_plate_id: null,
    caption: null,
    taken_when: 'before_treatment',
    storage_path: 'e1/m1.jpg',
    mime_type: 'image/jpeg',
    byte_size: 1000,
    width: 800,
    height: 600,
    created_at: '2026-08-19T10:00:00.000Z',
    signed_url: null,
    ...patch,
  }
}

describe('leftoverEventMediaError', () => {
  it('ignores unfinished drafts on draft save', () => {
    expect(leftoverEventMediaError(2, 'draft')).toBeUndefined()
  })

  it('blocks complete when a draft is missing when-taken', () => {
    expect(leftoverEventMediaError(1, 'complete')).toBe(EVENT_MEDIA_LEFTOVER_ERROR)
  })

  it('allows complete with zero unfinished drafts', () => {
    expect(leftoverEventMediaError(0, 'complete')).toBeUndefined()
  })
})

describe('captionError', () => {
  it('allows empty and 200 chars', () => {
    expect(captionError('')).toBeUndefined()
    expect(captionError('א'.repeat(200))).toBeUndefined()
  })

  it('rejects 201 chars', () => {
    expect(captionError('א'.repeat(201))).toBe(EVENT_MEDIA_CAPTION_ERROR)
  })
})

describe('canAddMoreMedia', () => {
  it('allows the 20th slot and blocks the 21st', () => {
    expect(canAddMoreMedia(19, 0)).toBe(true)
    expect(canAddMoreMedia(19, 1)).toBe(false)
    expect(canAddMoreMedia(20, 0)).toBe(false)
    expect(slotsRemaining(18, 1)).toBe(1)
    expect(EVENT_MEDIA_CAP).toBe(20)
  })

  it('does not count unfinished drafts (caller omits them from inFlight)', () => {
    expect(canAddMoreMedia(19, 0)).toBe(true)
  })
})

describe('groupMediaByTakenWhen', () => {
  it('sorts each band by created_at ascending', () => {
    const grouped = groupMediaByTakenWhen([
      media({ id: 'b2', taken_when: 'before_treatment', created_at: '2026-08-19T12:00:00.000Z' }),
      media({
        id: 'd1',
        taken_when: 'during_after_treatment',
        created_at: '2026-08-19T11:00:00.000Z',
      }),
      media({ id: 'b1', taken_when: 'before_treatment', created_at: '2026-08-19T10:00:00.000Z' }),
    ])
    expect(grouped.before.map((row) => row.id)).toEqual(['b1', 'b2'])
    expect(grouped.during.map((row) => row.id)).toEqual(['d1'])
  })
})

describe('eventMediaStoragePath', () => {
  it('is {eventId}/{mediaId}.jpg', () => {
    expect(eventMediaStoragePath('e1', 'm1')).toBe('e1/m1.jpg')
  })
})

describe('mapEventMediaError', () => {
  it('maps the cap exception', () => {
    expect(mapEventMediaError('event_media_cap')).toBe(EVENT_MEDIA_CAP_ERROR)
    expect(mapEventMediaError('new row violates event_media_cap')).toBe(EVENT_MEDIA_CAP_ERROR)
  })

  it('falls back to the network copy', () => {
    expect(mapEventMediaError('jwt expired')).toBe(EVENT_MEDIA_NETWORK)
    expect(mapEventMediaError(undefined)).toBe(EVENT_MEDIA_NETWORK)
  })
})

describe('mergeMediaPlates', () => {
  it('unions responder-keyed and event-keyed plates by id', () => {
    expect(
      mergeMediaPlates(
        [{ id: 'a', plate_number: '12-345-67' }],
        [
          { id: 'a', plate_number: '12-345-67' },
          { id: 'b', plate_number: '123-45-678' },
        ],
      ),
    ).toEqual([
      { id: 'a', plate_number: '12-345-67' },
      { id: 'b', plate_number: '123-45-678' },
    ])
  })
})
