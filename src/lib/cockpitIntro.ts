export const COCKPIT_INTRO_STORAGE_KEY = 'yahpaz:cockpit_intro_seen'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  if (typeof globalThis.localStorage === 'undefined') return null
  return globalThis.localStorage
}

function keyFor(userId: string): string {
  return `${COCKPIT_INTRO_STORAGE_KEY}:${userId}`
}

export function hasSeenCockpitIntro(
  userId: string,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!userId) return true
  if (!storage) return false
  return storage.getItem(keyFor(userId)) === '1'
}

export function markCockpitIntroSeen(
  userId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage || !userId) return
  storage.setItem(keyFor(userId), '1')
}
