import { describe, expect, it } from 'vitest'
import {
  EVENT_MEDIA_BAD_TYPE,
  EVENT_MEDIA_COMPRESS_FAIL,
  EVENT_MEDIA_HEIC_FAIL,
  EVENT_MEDIA_TOO_LARGE,
} from './eventMedia'
import {
  EVENT_MEDIA_MAX_LONG_EDGE,
  EVENT_MEDIA_MAX_ORIGINAL_BYTES,
  EVENT_MEDIA_MAX_OUTPUT_BYTES,
  compressEventImage,
  nextJpegQuality,
  rejectOriginalFile,
  targetDimensions,
} from './compressEventImage'

describe('rejectOriginalFile', () => {
  it('rejects empty, video, and oversized files', () => {
    expect(rejectOriginalFile({ type: 'image/jpeg', size: 0 })).toBe(EVENT_MEDIA_BAD_TYPE)
    expect(rejectOriginalFile({ type: 'video/mp4', size: 1000 })).toBe(EVENT_MEDIA_BAD_TYPE)
    expect(rejectOriginalFile({ type: 'application/pdf', size: 1000 })).toBe(EVENT_MEDIA_BAD_TYPE)
    expect(
      rejectOriginalFile({ type: 'image/jpeg', size: EVENT_MEDIA_MAX_ORIGINAL_BYTES + 1 }),
    ).toBe(EVENT_MEDIA_TOO_LARGE)
  })

  it('allows jpeg/png/webp/heic under the original cap', () => {
    expect(rejectOriginalFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(rejectOriginalFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(rejectOriginalFile({ type: 'image/webp', size: 1000 })).toBeNull()
    expect(rejectOriginalFile({ type: 'image/heic', size: 1000 })).toBeNull()
    expect(rejectOriginalFile({ type: 'image/heif', size: 1000 })).toBeNull()
  })
})

describe('targetDimensions', () => {
  it('never upscales', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('fits the long edge to 1600', () => {
    expect(targetDimensions(3200, 2400)).toEqual({ width: 1600, height: 1200 })
    expect(targetDimensions(1200, 3200)).toEqual({ width: 600, height: 1600 })
    expect(EVENT_MEDIA_MAX_LONG_EDGE).toBe(1600)
  })
})

describe('nextJpegQuality', () => {
  it('stops when the blob is small enough', () => {
    expect(nextJpegQuality(500_000, 0)).toBeNull()
  })

  it('steps 0.72 → 0.60 → 0.50 then null', () => {
    expect(nextJpegQuality(800_000, 0)).toBe(0.6)
    expect(nextJpegQuality(800_000, 1)).toBe(0.5)
    expect(nextJpegQuality(800_000, 2)).toBeNull()
  })
})

describe('compressEventImage', () => {
  it('returns a jpeg blob from injected decode/encode', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'shot.png', { type: 'image/png' })
    const result = await compressEventImage(file, {
      decode: async () => ({ width: 2000, height: 1000 }),
      encode: async (_image, width, height, quality) => {
        expect(width).toBe(1600)
        expect(height).toBe(800)
        expect(quality).toBe(0.72)
        return new Blob([new Uint8Array(100)], { type: 'image/jpeg' })
      },
    })
    expect(result).toEqual({
      ok: true,
      blob: expect.any(Blob),
      width: 1600,
      height: 800,
    })
    if (result.ok) expect(result.blob.type).toBe('image/jpeg')
  })

  it('retries quality until the blob is small enough', async () => {
    const file = new File([new Uint8Array(10)], 'shot.jpg', { type: 'image/jpeg' })
    const qualities: number[] = []
    const result = await compressEventImage(file, {
      decode: async () => ({ width: 800, height: 600 }),
      encode: async (_image, _w, _h, quality) => {
        qualities.push(quality)
        const size = quality === 0.5 ? 100 : 800_000
        return new Blob([new Uint8Array(size)], { type: 'image/jpeg' })
      },
    })
    expect(qualities).toEqual([0.72, 0.6, 0.5])
    expect(result.ok).toBe(true)
  })

  it('fails when the last quality is still over the output cap', async () => {
    const file = new File([new Uint8Array(10)], 'shot.jpg', { type: 'image/jpeg' })
    const result = await compressEventImage(file, {
      decode: async () => ({ width: 800, height: 600 }),
      encode: async () =>
        new Blob([new Uint8Array(EVENT_MEDIA_MAX_OUTPUT_BYTES + 1)], { type: 'image/jpeg' }),
    })
    expect(result).toEqual({ ok: false, error: EVENT_MEDIA_COMPRESS_FAIL })
  })

  it('maps decode failure to the HEIC copy', async () => {
    const file = new File([new Uint8Array(10)], 'shot.heic', { type: 'image/heic' })
    const result = await compressEventImage(file, {
      decode: async () => {
        throw new Error('decode')
      },
    })
    expect(result).toEqual({ ok: false, error: EVENT_MEDIA_HEIC_FAIL })
  })

  it('rejects a video before decode', async () => {
    const file = new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' })
    const result = await compressEventImage(file)
    expect(result).toEqual({ ok: false, error: EVENT_MEDIA_BAD_TYPE })
  })
})
