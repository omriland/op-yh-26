/** Desktop sidebar width — default matches `--sidebar-width` token (240px). */

export const SIDEBAR_WIDTH_DEFAULT = 240
export const SIDEBAR_WIDTH_MIN = SIDEBAR_WIDTH_DEFAULT - 50
export const SIDEBAR_WIDTH_MAX = SIDEBAR_WIDTH_DEFAULT + 25
export const SIDEBAR_WIDTH_STORAGE_KEY = 'yahpaz.sidebarWidth'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function clampSidebarWidth(width: number): number {
  const rounded = Math.round(width)
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, rounded))
}

export function parseStoredSidebarWidth(raw: string | null): number {
  if (raw == null || raw.trim() === '') return SIDEBAR_WIDTH_DEFAULT
  const value = Number(raw)
  if (!Number.isFinite(value)) return SIDEBAR_WIDTH_DEFAULT
  return clampSidebarWidth(value)
}

export function readSidebarWidth(storage: StorageLike): number {
  return parseStoredSidebarWidth(storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
}

export function writeSidebarWidth(storage: StorageLike, width: number): void {
  storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)))
}

export function nextSidebarWidthFromPointer(input: {
  startWidth: number
  startClientX: number
  clientX: number
  rtl: boolean
}): number {
  const deltaX = input.clientX - input.startClientX
  const signed = input.rtl ? -deltaX : deltaX
  return clampSidebarWidth(input.startWidth + signed)
}
