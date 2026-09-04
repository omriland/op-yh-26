/**
 * Device-local mirror of an in-progress fill draft.
 *
 * PRODUCT.md records "no offline sync", which makes this the only floor under a
 * responder's typing: the fill flow otherwise holds `פירוט הטיפול` in React state
 * only, so a backgrounded WebView, a discarded tab, or a dead connection loses
 * the narrative the record exists to capture. This is deliberately dumb — one
 * JSON blob per assignment, newest-wins, cleared on successful completion.
 */

const PREFIX = 'yahpaz.fillDraft.'

/** Anything older than this is stale enough that restoring it would confuse. */
export const FILL_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14

export type StashedFillDraft<T> = {
  savedAt: number
  draft: T
}

export function fillDraftKey(scope: string, id: string): string {
  return `${PREFIX}${scope}.${id}`
}

export type FillBackAction = 'drop_unfinished_photo' | 'show_docs' | 'leave'

/**
 * Back while an unfinished photo is open must drop that photo first.
 * On a media pane with no leftover photo, return to תיעוד. Otherwise leave
 * (caller persists the typed draft before navigating away).
 */
export function decideFillBack(
  onMediaPane: boolean,
  unfinishedMediaDraftCount: number,
): FillBackAction {
  if (unfinishedMediaDraftCount > 0) return 'drop_unfinished_photo'
  if (onMediaPane) return 'show_docs'
  return 'leave'
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    // Safari private mode and hardened WebViews throw on access, not on use.
    return null
  }
}

export function stashFillDraft<T>(
  scope: string,
  id: string,
  draft: T,
  now: number,
): void {
  const store = storage()
  if (!store) return
  const payload: StashedFillDraft<T> = { savedAt: now, draft }
  try {
    store.setItem(fillDraftKey(scope, id), JSON.stringify(payload))
  } catch {
    // A full quota must never break the form the user is typing into.
  }
}

export function readFillDraft<T>(
  scope: string,
  id: string,
  now: number,
): StashedFillDraft<T> | null {
  const store = storage()
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(fillDraftKey(scope, id))
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearFillDraft(scope, id)
    return null
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { savedAt?: unknown }).savedAt !== 'number' ||
    !('draft' in parsed)
  ) {
    clearFillDraft(scope, id)
    return null
  }

  const stashed = parsed as StashedFillDraft<T>
  if (now - stashed.savedAt > FILL_DRAFT_MAX_AGE_MS) {
    clearFillDraft(scope, id)
    return null
  }
  return stashed
}

export function clearFillDraft(scope: string, id: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(fillDraftKey(scope, id))
  } catch {
    // Nothing to do; a stale key expires on its own.
  }
}

/** `HH:mm` in the viewer's own clock, for the "saved at" caption. */
export function fillDraftSavedLabel(savedAt: number, locale = 'he-IL'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(new Date(savedAt))
}
