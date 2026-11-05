/**
 * One file input for all event media. It has no `capture` attribute, so the
 * phone's native picker offers both taking a photo or video and choosing from
 * the gallery or files. `capture` would force the camera and hide the gallery.
 * `.heic,.heif` lets desktop pickers show HEIC photos where the OS has no
 * image type for them.
 */
export const eventMediaFileInputAttributes = {
  accept: 'image/*,.heic,.heif,video/mp4,video/quicktime,video/webm',
  multiple: true,
} as const
