import { describe, expect, it } from 'vitest'
import {
  EVENT_MEDIA_CAP,
  EVENT_MEDIA_CAP_ERROR,
  EVENT_MEDIA_CAPTION_ERROR,
  EVENT_MEDIA_LEFTOVER_ERROR,
  EVENT_MEDIA_NETWORK,
  EVENT_MEDIA_VIDEO_MAX_BYTES,
  EVENT_MEDIA_VIDEO_TOO_LARGE,
  EVENT_MEDIA_NO_VEHICLE,
  canAddAnotherPhoto,
  canAddMoreMedia,
  canDeleteEventMedia,
  eventMediaKind,
  isVideoMedia,
  pickEventMediaFiles,
  rejectVideoFile,
  captionError,
  eventMediaStoragePath,
  groupMediaByTakenWhen,
  leftoverEventMediaError,
  mapEventMediaError,
  keepPhotoSubject,
  PHOTO_UNASSIGNED,
  resolvePlateDigits,
  photoAttachWrite,
  photoStepCanSave,
  photoStepVehicleNote,
  mergeMediaPlates,
  slotsRemaining,
  togglePlateId,
  uniquePlateIds,
  type EventMedia,
  type PhotoSubject,
} from './eventMedia'

function media(patch: Partial<EventMedia> = {}): EventMedia {
  return {
    id: 'm1',
    event_id: 'e1',
    uploaded_by: 'u1',
    uploader_name: 'דנה',
    treated_plate_ids: [],
    not_vehicle: false,
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

describe('photo attach step', () => {
  it('does not block save on empty text, sends the chosen subject, and leaves another add', () => {
    const subject: PhotoSubject = { kind: 'vehicles', digits: ['1234567'] }
    const write = photoAttachWrite({ caption: '   ', subject })
    expect(write.blocked).toBe(false)
    expect(write.caption).toBeNull()
    expect(write.subject).toEqual(subject)
    expect(
      photoStepCanSave({
        caption: '',
        takenWhen: 'during_after_treatment',
        preparing: false,
        vehiclesReady: true,
      }),
    ).toBe(true)
    expect(canAddAnotherPhoto(1)).toBe(true)
    expect(canAddAnotherPhoto(20)).toBe(false)
  })

  it('waits for the vehicle list and blocks a caption over 200 characters', () => {
    const base = { caption: '', takenWhen: 'before_treatment' as const, preparing: false }
    expect(photoStepCanSave({ ...base, vehiclesReady: false })).toBe(false)
    expect(photoStepCanSave({ ...base, vehiclesReady: true, caption: 'א'.repeat(201) })).toBe(false)
    expect(photoStepCanSave({ ...base, vehiclesReady: true, takenWhen: '' })).toBe(false)
  })

  it('keeps the choice while its vehicle is in the form and falls back when it is removed', () => {
    const one: PhotoSubject = { kind: 'vehicles', digits: ['1111111'] }
    expect(keepPhotoSubject(one, ['1111111', '2222222'])).toBe(one)
    expect(keepPhotoSubject(one, ['2222222'])).toEqual(PHOTO_UNASSIGNED)
    expect(
      keepPhotoSubject({ kind: 'vehicles', digits: ['1111111', '2222222'] }, ['2222222']),
    ).toEqual({ kind: 'vehicles', digits: ['2222222'] })
    expect(keepPhotoSubject({ kind: 'not_vehicle' }, [])).toEqual({ kind: 'not_vehicle' })
    expect(keepPhotoSubject(PHOTO_UNASSIGNED, [])).toEqual(PHOTO_UNASSIGNED)
    expect(photoStepVehicleNote(0)).toBe(EVENT_MEDIA_NO_VEHICLE)
    expect(photoStepVehicleNote(1)).toBeNull()
  })
})

describe('resolvePlateDigits', () => {
  const plate = (
    id: string,
    plate_number: string,
    owner: { event_responder_id?: string; event_id?: string },
  ) => ({ id, plate_number, model: null, color: null, logo_slug: null, ...owner })

  it('finds the saved row by digits and reports a vehicle not saved yet as missing', () => {
    const plates = [plate('row-a', '12-345-67', { event_responder_id: 'er1' })]
    expect(
      resolvePlateDigits(plates, ['1234567', '7654321'], { eventResponderId: 'er1' }),
    ).toEqual({ ids: ['row-a'], missing: ['7654321'] })
  })

  it("never links to another responder's car with the same plate", () => {
    const plates = [
      plate('theirs', '12-345-67', { event_responder_id: 'er2' }),
      plate('mine', '12-345-67', { event_responder_id: 'er1' }),
    ]
    expect(resolvePlateDigits(plates, ['1234567'], { eventResponderId: 'er1' }).ids).toEqual([
      'mine',
    ])
    expect(resolvePlateDigits(plates.slice(0, 1), ['1234567'], { eventResponderId: 'er1' })).toEqual(
      { ids: [], missing: ['1234567'] },
    )
  })

  it("uses a shift event's shared rows, and any row when there is no form", () => {
    const plates = [plate('shared', '123-45-678', { event_id: 'e1' })]
    expect(resolvePlateDigits(plates, ['12345678'], { eventId: 'e1' }).ids).toEqual(['shared'])
    expect(resolvePlateDigits(plates, ['12345678'], null).ids).toEqual(['shared'])
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

  it('uses the video extension for each video type', () => {
    expect(eventMediaStoragePath('e1', 'm1', 'video/mp4')).toBe('e1/m1.mp4')
    expect(eventMediaStoragePath('e1', 'm1', 'video/quicktime')).toBe('e1/m1.mov')
    expect(eventMediaStoragePath('e1', 'm1', 'video/webm')).toBe('e1/m1.webm')
  })
})

describe('eventMediaKind', () => {
  it('treats any image type as a photo (compressed to JPEG later)', () => {
    expect(eventMediaKind({ type: 'image/png' })).toBe('image')
    expect(eventMediaKind({ type: 'image/heic' })).toBe('image')
  })

  it('treats a .heic file with no reported type as a photo', () => {
    expect(eventMediaKind({ type: '', name: 'IMG_0001.HEIC' })).toBe('image')
  })

  it('accepts MP4, QuickTime and WebM videos only', () => {
    expect(eventMediaKind({ type: 'video/mp4' })).toBe('video')
    expect(eventMediaKind({ type: 'video/quicktime' })).toBe('video')
    expect(eventMediaKind({ type: 'video/webm' })).toBe('video')
    expect(eventMediaKind({ type: 'video/x-msvideo' })).toBeNull()
  })

  it('rejects everything else', () => {
    expect(eventMediaKind({ type: 'application/pdf' })).toBeNull()
    expect(eventMediaKind({ type: '' })).toBeNull()
  })
})

describe('isVideoMedia', () => {
  it('is true for stored video rows only', () => {
    expect(isVideoMedia('video/mp4')).toBe(true)
    expect(isVideoMedia('image/jpeg')).toBe(false)
  })
})

describe('rejectVideoFile', () => {
  it('accepts a video up to 25 MB', () => {
    expect(rejectVideoFile({ size: EVENT_MEDIA_VIDEO_MAX_BYTES })).toBeNull()
  })

  it('rejects a longer video and an empty file', () => {
    expect(rejectVideoFile({ size: EVENT_MEDIA_VIDEO_MAX_BYTES + 1 })).toBe(
      EVENT_MEDIA_VIDEO_TOO_LARGE,
    )
    expect(rejectVideoFile({ size: 0 })).toBe(EVENT_MEDIA_VIDEO_TOO_LARGE)
  })
})

describe('pickEventMediaFiles', () => {
  const photo = { type: 'image/jpeg', name: 'a.jpg' }
  const video = { type: 'video/mp4', name: 'b.mp4' }
  const pdf = { type: 'application/pdf', name: 'c.pdf' }

  it('keeps photos and videos in order and counts the rest as unsupported', () => {
    expect(pickEventMediaFiles([photo, pdf, video], 20)).toEqual({
      accepted: [photo, video],
      unsupported: 1,
      overCap: 0,
    })
  })

  it('stops at the slots left and counts what did not fit', () => {
    expect(pickEventMediaFiles([photo, video, photo], 2)).toEqual({
      accepted: [photo, video],
      unsupported: 0,
      overCap: 1,
    })
    expect(pickEventMediaFiles([photo], 0)).toEqual({ accepted: [], unsupported: 0, overCap: 1 })
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

describe('togglePlateId', () => {
  it('adds a missing id and removes an existing one', () => {
    expect(togglePlateId(['a'], 'b')).toEqual(['a', 'b'])
    expect(togglePlateId(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('uniquePlateIds', () => {
  it('drops blanks and duplicates, keeps first-seen order', () => {
    expect(uniquePlateIds(['b', '', 'a', 'b'])).toEqual(['b', 'a'])
  })
})

describe('mergeMediaPlates', () => {
  it('unions responder-keyed and event-keyed plates by id', () => {
    expect(
      mergeMediaPlates(
        [{ id: 'a', plate_number: '12-345-67', model: 'REXTON', color: 'שחור', logo_slug: 'ssangyong' }],
        [
          { id: 'a', plate_number: '12-345-67', model: 'REXTON', color: 'שחור', logo_slug: 'ssangyong' },
          { id: 'b', plate_number: '123-45-678', model: null, color: null, logo_slug: null },
        ],
      ),
    ).toEqual([
      { id: 'a', plate_number: '12-345-67', model: 'REXTON', color: 'שחור', logo_slug: 'ssangyong' },
      { id: 'b', plate_number: '123-45-678', model: null, color: null, logo_slug: null },
    ])
  })
})

describe('canDeleteEventMedia', () => {
  it('lets the uploader delete while they may write', () => {
    expect(canDeleteEventMedia(media({ uploaded_by: 'u1' }), 'u1', true)).toBe(true)
  })

  it('keeps media uploaded by someone else view-only', () => {
    expect(canDeleteEventMedia(media({ uploaded_by: 'u2' }), 'u1', true)).toBe(false)
  })

  it('keeps the uploader view-only when the event is read-only', () => {
    expect(canDeleteEventMedia(media({ uploaded_by: 'u1' }), 'u1', false)).toBe(false)
  })

  it('denies a signed-out viewer', () => {
    expect(canDeleteEventMedia(media({ uploaded_by: 'u1' }), null, true)).toBe(false)
  })
})
