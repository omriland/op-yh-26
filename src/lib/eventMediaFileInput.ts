/**
 * Two separate file inputs. `capture` on the upload input hides the gallery
 * on some phones, so only the take-photo input sets it. The upload input also
 * takes short videos. `.heic,.heif` lets desktop pickers show HEIC photos
 * where the OS has no image type for them.
 */
export type EventMediaFileInputKind = 'upload' | 'camera'

type EventMediaFileInputAttributes = {
  accept: string
  capture?: 'environment'
  multiple?: true
}

export function eventMediaFileInputAttributes(
  kind: EventMediaFileInputKind,
): EventMediaFileInputAttributes {
  if (kind === 'camera') {
    return { accept: 'image/*', capture: 'environment' }
  }
  return { accept: 'image/*,.heic,.heif,video/mp4,video/quicktime,video/webm', multiple: true }
}
