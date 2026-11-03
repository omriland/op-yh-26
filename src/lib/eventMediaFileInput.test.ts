import { describe, expect, it } from 'vitest'
import { eventMediaFileInputAttributes } from './eventMediaFileInput'

describe('eventMediaFileInputAttributes', () => {
  it('accepts photos, HEIC and short videos, several at once', () => {
    expect(eventMediaFileInputAttributes.accept).toBe(
      'image/*,.heic,.heif,video/mp4,video/quicktime,video/webm',
    )
    expect(eventMediaFileInputAttributes.multiple).toBe(true)
  })

  it('has no capture, so the phone picker offers camera and gallery', () => {
    expect('capture' in eventMediaFileInputAttributes).toBe(false)
  })
})
