/**
 * Two separate file inputs. `capture` on the upload input hides the gallery
 * on some phones, so only the take-photo input sets it.
 */
export type EventMediaFileInputKind = 'upload' | 'camera'

type EventMediaFileInputAttributes = {
  accept: 'image/*'
  capture?: 'environment'
  multiple?: true
}

export function eventMediaFileInputAttributes(
  kind: EventMediaFileInputKind,
): EventMediaFileInputAttributes {
  if (kind === 'camera') {
    return { accept: 'image/*', capture: 'environment' }
  }
  return { accept: 'image/*', multiple: true }
}
