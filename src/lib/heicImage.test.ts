import { describe, expect, it } from 'vitest'
import { heicToJpegFile, isHeicFile } from './heicImage'

describe('isHeicFile', () => {
  it('matches HEIC and HEIF by type', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'a' })).toBe(true)
    expect(isHeicFile({ type: 'image/heif', name: 'a' })).toBe(true)
    expect(isHeicFile({ type: 'image/heic-sequence', name: 'a' })).toBe(true)
    expect(isHeicFile({ type: 'image/HEIF', name: 'a' })).toBe(true)
  })

  it('matches by extension when the browser reports no image type', () => {
    expect(isHeicFile({ type: '', name: '20261101_225500.heic' })).toBe(true)
    expect(isHeicFile({ type: 'application/octet-stream', name: 'IMG.HEIF' })).toBe(true)
  })

  it('leaves other images alone', () => {
    expect(isHeicFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false)
    expect(isHeicFile({ type: 'image/png', name: 'a.heic.png' })).toBe(false)
    expect(isHeicFile({ type: '', name: 'notes.txt' })).toBe(false)
  })
})

describe('heicToJpegFile', () => {
  const heic = new File([new Uint8Array([1, 2, 3])], '20261101_225500.heic', {
    type: 'image/heic',
  })

  it('returns a JPEG file named .jpg', async () => {
    const jpeg = new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' })
    const file = await heicToJpegFile(heic, async () => jpeg)
    expect(file).not.toBeNull()
    expect(file!.type).toBe('image/jpeg')
    expect(file!.name).toBe('20261101_225500.jpg')
    expect(file!.size).toBe(2)
  })

  it('returns null when the converter fails', async () => {
    const file = await heicToJpegFile(heic, async () => {
      throw new Error('libheif')
    })
    expect(file).toBeNull()
  })

  it('returns null when the converter yields an empty blob', async () => {
    const file = await heicToJpegFile(heic, async () => new Blob([], { type: 'image/jpeg' }))
    expect(file).toBeNull()
  })
})
