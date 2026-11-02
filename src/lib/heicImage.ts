/**
 * HEIC / HEIF photos (Samsung "high efficiency pictures", iPhone originals)
 * that Chrome and Firefox cannot decode. They are converted to JPEG in the
 * browser as soon as they are picked, so the preview, compression and upload
 * only ever see a JPEG.
 */

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])
const HEIC_EXTENSION = /\.hei[cf]$/i

export function isHeicFile(file: { type: string; name?: string }): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true
  // Some pickers (and Windows without the HEIF extension) report no image type.
  if (file.type.startsWith('image/')) return false
  return HEIC_EXTENSION.test(file.name ?? '')
}

type HeicConvert = (blob: Blob) => Promise<Blob>

// The decoder is about 3 MB, so it loads only when a HEIC photo is picked.
const defaultConvert: HeicConvert = async (blob) => {
  const { heicTo } = await import('heic-to')
  return heicTo({ blob, type: 'image/jpeg', quality: 0.9 })
}

/** The photo as a JPEG file, or null when it could not be decoded. */
export async function heicToJpegFile(
  file: File,
  convert: HeicConvert = defaultConvert,
): Promise<File | null> {
  try {
    const jpeg = await convert(file)
    if (!jpeg.size) return null
    const name = HEIC_EXTENSION.test(file.name)
      ? file.name.replace(HEIC_EXTENSION, '.jpg')
      : `${file.name || 'photo'}.jpg`
    return new File([jpeg], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return null
  }
}
