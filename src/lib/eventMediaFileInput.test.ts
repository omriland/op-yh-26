import { describe, expect, it } from 'vitest'
import { eventMediaFileInputAttributes } from './eventMediaFileInput'

describe('eventMediaFileInputAttributes', () => {
  it('keeps the upload input free of capture', () => {
    const upload = eventMediaFileInputAttributes('upload')
    expect(upload.accept).toBe('image/*,video/mp4,video/quicktime,video/webm')
    expect(upload.multiple).toBe(true)
    expect(upload.capture).toBeUndefined()
  })

  it('sets capture on the camera input', () => {
    const camera = eventMediaFileInputAttributes('camera')
    expect(camera.accept).toBe('image/*')
    expect(camera.capture).toBe('environment')
    expect(camera.multiple).toBeUndefined()
  })
})
