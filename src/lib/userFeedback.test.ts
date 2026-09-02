import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_ATTACH_COUNT_ERROR,
  FEEDBACK_ATTACH_IMAGE_SIZE_ERROR,
  FEEDBACK_ATTACH_MAX,
  FEEDBACK_ATTACH_TYPE_ERROR,
  FEEDBACK_ATTACH_VIDEO_SIZE_ERROR,
  FEEDBACK_BODY_ERROR,
  FEEDBACK_BODY_MAX,
  FEEDBACK_EMPTY_ERROR,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_KIND_ERROR,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_SMS_EXCERPT_MAX,
  FEEDBACK_STATUS_STAMP,
  FEEDBACK_VIDEO_MAX_BYTES,
  addFeedbackAttachments,
  buildFeedbackTreatedSms,
  canManageFeedbackInbox,
  feedbackAttachmentExt,
  feedbackAttachmentKind,
  feedbackAttachmentStoragePath,
  feedbackBodyError,
  feedbackSmsExcerpt,
  feedbackStorageExt,
  feedbackStoragePath,
  feedbackSubmitError,
  feedbackTreatedToast,
  firstNameFromFullName,
  formatRecordSeconds,
  isMissingFeedbackAttachmentsColumn,
  normalizeFeedbackAttachmentMime,
  normalizeFeedbackAudioMime,
  parseFeedbackAttachments,
  sanitizeFeedbackAttachmentName,
} from './userFeedback'

describe('canManageFeedbackInbox', () => {
  it('is true only for super_admin', () => {
    expect(canManageFeedbackInbox(['admin'])).toBe(false)
    expect(canManageFeedbackInbox(['admin', 'super_admin'])).toBe(true)
    expect(canManageFeedbackInbox(['responder'])).toBe(false)
  })
})

describe('feedbackSubmitError', () => {
  it('requires a kind', () => {
    expect(feedbackSubmitError({ kind: null, body: 'יש באג', hasAudio: false })).toBe(
      FEEDBACK_KIND_ERROR,
    )
  })

  it('requires text or audio', () => {
    expect(feedbackSubmitError({ kind: 'bug', body: '   ', hasAudio: false })).toBe(
      FEEDBACK_EMPTY_ERROR,
    )
  })

  it('accepts text only or audio only', () => {
    expect(feedbackSubmitError({ kind: 'bug', body: 'מסך קפוא', hasAudio: false })).toBeUndefined()
    expect(feedbackSubmitError({ kind: 'suggestion', body: '', hasAudio: true })).toBeUndefined()
  })

  it('rejects a body over 2000 chars', () => {
    expect(feedbackBodyError('א'.repeat(FEEDBACK_BODY_MAX))).toBeUndefined()
    expect(feedbackBodyError('א'.repeat(FEEDBACK_BODY_MAX + 1))).toBe(FEEDBACK_BODY_ERROR)
    expect(
      feedbackSubmitError({
        kind: 'bug',
        body: 'א'.repeat(FEEDBACK_BODY_MAX + 1),
        hasAudio: true,
      }),
    ).toBe(FEEDBACK_BODY_ERROR)
  })
})

describe('feedback audio helpers', () => {
  it('maps mime types to storage extensions and normalized types', () => {
    expect(feedbackStorageExt('audio/webm;codecs=opus')).toBe('webm')
    expect(feedbackStorageExt('audio/mp4')).toBe('m4a')
    expect(normalizeFeedbackAudioMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(normalizeFeedbackAudioMime('audio/mp4')).toBe('audio/mp4')
    expect(feedbackStoragePath('u1', 'f1', 'audio/webm')).toBe('u1/f1.webm')
  })

  it('formats the record timer with a 90s cap', () => {
    expect(formatRecordSeconds(0)).toBe('00:00')
    expect(formatRecordSeconds(9)).toBe('00:09')
    expect(formatRecordSeconds(75)).toBe('01:15')
    expect(formatRecordSeconds(200)).toBe('01:30')
  })
})

describe('feedback attachments', () => {
  it('maps mime and extension, including empty mime via filename', () => {
    expect(normalizeFeedbackAttachmentMime('image/jpeg', 'a.jpg')).toBe('image/jpeg')
    expect(normalizeFeedbackAttachmentMime('', 'screen.PNG')).toBe('image/png')
    expect(normalizeFeedbackAttachmentMime('video/quicktime', 'clip.mov')).toBe('video/quicktime')
    expect(feedbackAttachmentKind('image/webp', 'x.webp')).toBe('image')
    expect(feedbackAttachmentKind('video/mp4', 'x.mp4')).toBe('video')
    expect(feedbackAttachmentExt('image/jpeg')).toBe('jpg')
    expect(feedbackAttachmentStoragePath('u1', 'f1', 'a1', 'image/png', 'shot.png')).toBe(
      'u1/f1/a1.png',
    )
  })

  it('rejects a fourth file and keeps the first three', () => {
    const current = [
      { name: '1.jpg', type: 'image/jpeg', size: 10 },
      { name: '2.jpg', type: 'image/jpeg', size: 10 },
      { name: '3.jpg', type: 'image/jpeg', size: 10 },
    ]
    const result = addFeedbackAttachments(current, [{ name: '4.jpg', type: 'image/jpeg', size: 10 }])
    expect(result.files).toHaveLength(FEEDBACK_ATTACH_MAX)
    expect(result.error).toBe(FEEDBACK_ATTACH_COUNT_ERROR)
  })

  it('rejects wrong types and oversized files without adding them', () => {
    const empty = addFeedbackAttachments([], [{ name: 'note.pdf', type: 'application/pdf', size: 10 }])
    expect(empty.files).toEqual([])
    expect(empty.error).toBe(FEEDBACK_ATTACH_TYPE_ERROR)

    const hugeImage = addFeedbackAttachments(
      [],
      [{ name: 'big.jpg', type: 'image/jpeg', size: FEEDBACK_IMAGE_MAX_BYTES + 1 }],
    )
    expect(hugeImage.files).toEqual([])
    expect(hugeImage.error).toBe(FEEDBACK_ATTACH_IMAGE_SIZE_ERROR)

    const hugeVideo = addFeedbackAttachments(
      [],
      [{ name: 'big.mp4', type: 'video/mp4', size: FEEDBACK_VIDEO_MAX_BYTES + 1 }],
    )
    expect(hugeVideo.files).toEqual([])
    expect(hugeVideo.error).toBe(FEEDBACK_ATTACH_VIDEO_SIZE_ERROR)
  })

  it('accepts one valid image or short video', () => {
    const image = addFeedbackAttachments(
      [],
      [{ name: 'screen.jpg', type: 'image/jpeg', size: 1024 }],
    )
    expect(image.error).toBeUndefined()
    expect(image.files).toHaveLength(1)
    const video = addFeedbackAttachments(
      image.files,
      [{ name: 'clip.mp4', type: 'video/mp4', size: 2048 }],
    )
    expect(video.error).toBeUndefined()
    expect(video.files).toHaveLength(2)
  })

  it('parses stored metadata and sanitizes names', () => {
    expect(parseFeedbackAttachments(null)).toEqual([])
    expect(
      parseFeedbackAttachments([
        { path: 'u/f/a.jpg', mime: 'image/jpeg', size: 12, name: 'a.jpg' },
        { path: '', mime: 'image/jpeg', size: 12, name: 'skip.jpg' },
      ]),
    ).toEqual([{ path: 'u/f/a.jpg', mime: 'image/jpeg', size: 12, name: 'a.jpg' }])
    expect(sanitizeFeedbackAttachmentName('  ../evil\\name.png  ')).toBe('..evilname.png')
  })

  it('detects a missing attachments column', () => {
    expect(
      isMissingFeedbackAttachmentsColumn({
        code: '42703',
        message: 'column user_feedback.attachments does not exist',
      }),
    ).toBe(true)
    expect(isMissingFeedbackAttachmentsColumn({ code: '42703', message: 'other' })).toBe(false)
  })
})

describe('feedback labels', () => {
  it('keeps Hebrew kind and status stamps stable', () => {
    expect(FEEDBACK_KIND_LABEL.bug).toBe('באג')
    expect(FEEDBACK_KIND_LABEL.suggestion).toBe('הצעה')
    expect(FEEDBACK_STATUS_STAMP.open).toEqual({ label: 'פתוח', tone: 'pending' })
    expect(FEEDBACK_STATUS_STAMP.fixed).toEqual({ label: 'טופל', tone: 'done' })
    expect(FEEDBACK_STATUS_STAMP.wont_do).toEqual({ label: 'לא יטופל', tone: 'draft' })
  })
})

describe('feedback treated SMS', () => {
  it('uses the first name and quotes the body', () => {
    expect(firstNameFromFullName('עמרי לנדמן')).toBe('עמרי')
    expect(
      buildFeedbackTreatedSms({
        fullName: 'עמרי לנדמן',
        body: 'המסך נתקע',
        hasAudio: false,
      }),
    ).toBe(
      'היי, עמרי,\nרק רצינו לעדכן שהפידבק שנתת על המסך נתקע טופל\n"אבן דרך"',
    )
  })

  it('falls back when the name or body is missing', () => {
    expect(firstNameFromFullName('  ')).toBe('')
    expect(feedbackSmsExcerpt(null, true)).toBe('ההקלטה')
    expect(feedbackSmsExcerpt('   ', false)).toBe('המשוב')
    expect(
      buildFeedbackTreatedSms({
        fullName: null,
        body: null,
        hasAudio: true,
      }),
    ).toBe('היי,\nרק רצינו לעדכן שהפידבק שנתת על ההקלטה טופל\n"אבן דרך"')
  })

  it('collapses whitespace and truncates a long body', () => {
    expect(feedbackSmsExcerpt('שורה\nשנייה', false)).toBe('שורה שנייה')
    const long = 'א'.repeat(FEEDBACK_SMS_EXCERPT_MAX + 10)
    const excerpt = feedbackSmsExcerpt(long, false)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBe(FEEDBACK_SMS_EXCERPT_MAX)
  })

  it('warns when the treated SMS did not go out', () => {
    expect(feedbackTreatedToast('sent')).toEqual({ message: 'הסטטוס עודכן.', tone: 'done' })
    expect(feedbackTreatedToast('skipped_no_phone').tone).toBe('alert')
    expect(feedbackTreatedToast('failed').message).toContain('SMS')
  })
})
