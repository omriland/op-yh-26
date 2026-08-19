import {
  EVENT_MEDIA_BAD_TYPE,
  EVENT_MEDIA_COMPRESS_FAIL,
  EVENT_MEDIA_HEIC_FAIL,
  EVENT_MEDIA_TOO_LARGE,
} from './eventMedia'

export const EVENT_MEDIA_MAX_ORIGINAL_BYTES = 20 * 1024 * 1024
export const EVENT_MEDIA_MAX_OUTPUT_BYTES = Math.floor(1.5 * 1024 * 1024)
export const EVENT_MEDIA_MAX_LONG_EDGE = 1600
export const EVENT_MEDIA_TARGET_BYTES = 700 * 1024
export const EVENT_MEDIA_QUALITY_STEPS = [0.72, 0.6, 0.5] as const

export type CompressOk = { ok: true; blob: Blob; width: number; height: number }
export type CompressFail = { ok: false; error: string }
export type ImageBitmapLike = { width: number; height: number }

export function rejectOriginalFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!file.size) return EVENT_MEDIA_BAD_TYPE
  if (!file.type.startsWith('image/')) return EVENT_MEDIA_BAD_TYPE
  if (file.size > EVENT_MEDIA_MAX_ORIGINAL_BYTES) return EVENT_MEDIA_TOO_LARGE
  return null
}

export function targetDimensions(
  width: number,
  height: number,
  maxLongEdge: number = EVENT_MEDIA_MAX_LONG_EDGE,
): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) return { width, height }
  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function nextJpegQuality(byteSize: number, qualityIndex: number): number | null {
  if (byteSize <= EVENT_MEDIA_TARGET_BYTES) return null
  return EVENT_MEDIA_QUALITY_STEPS[qualityIndex + 1] ?? null
}

async function defaultDecode(blob: Blob): Promise<ImageBitmapLike> {
  return createImageBitmap(blob)
}

async function defaultEncode(
  image: ImageBitmapLike,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(image as CanvasImageSource, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((next) => resolve(next), 'image/jpeg', quality)
  })
  if (!blob) throw new Error('toBlob')
  return blob
}

export async function compressEventImage(
  file: File,
  deps: {
    decode?: (blob: Blob) => Promise<ImageBitmapLike>
    encode?: (
      image: ImageBitmapLike,
      width: number,
      height: number,
      quality: number,
    ) => Promise<Blob>
  } = {},
): Promise<CompressOk | CompressFail> {
  const rejected = rejectOriginalFile(file)
  if (rejected) return { ok: false, error: rejected }

  const decode = deps.decode ?? defaultDecode
  const encode = deps.encode ?? defaultEncode

  let image: ImageBitmapLike
  try {
    image = await decode(file)
  } catch {
    return { ok: false, error: EVENT_MEDIA_HEIC_FAIL }
  }

  const size = targetDimensions(image.width, image.height)
  let qualityIndex = 0
  let blob: Blob | null = null

  try {
    while (qualityIndex < EVENT_MEDIA_QUALITY_STEPS.length) {
      const quality = EVENT_MEDIA_QUALITY_STEPS[qualityIndex]
      blob = await encode(image, size.width, size.height, quality)
      const next = nextJpegQuality(blob.size, qualityIndex)
      if (next == null) break
      qualityIndex += 1
    }
  } catch {
    return { ok: false, error: EVENT_MEDIA_COMPRESS_FAIL }
  }

  if (!blob || blob.size > EVENT_MEDIA_MAX_OUTPUT_BYTES) {
    return { ok: false, error: EVENT_MEDIA_COMPRESS_FAIL }
  }

  return { ok: true, blob, width: size.width, height: size.height }
}
