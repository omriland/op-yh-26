import {
  clearFillDraft,
  readFillDraft,
  stashFillDraft,
} from './fillDraftStash'
import type { BroadcastAudience, BroadcastChannel } from './unitBroadcast'

export const UNIT_BROADCAST_STASH_SCOPE = 'unitBroadcast'
export const UNIT_BROADCAST_STASH_DEBOUNCE_MS = 600
export const UNIT_BROADCAST_STASH_ID = 'compose'

export type UnitBroadcastStashDraft = {
  channel: BroadcastChannel
  audience: BroadcastAudience
  subject: string
  body: string
}

export function shouldStashUnitBroadcastDraft(draft: UnitBroadcastStashDraft): boolean {
  return Boolean(draft.subject.trim() || draft.body.trim())
}

export function readUnitBroadcastStash(now: number): UnitBroadcastStashDraft | null {
  return (
    readFillDraft<UnitBroadcastStashDraft>(
      UNIT_BROADCAST_STASH_SCOPE,
      UNIT_BROADCAST_STASH_ID,
      now,
    )?.draft ?? null
  )
}

export function stashUnitBroadcastDraft(draft: UnitBroadcastStashDraft, now: number): void {
  if (!shouldStashUnitBroadcastDraft(draft)) {
    clearUnitBroadcastStash()
    return
  }
  stashFillDraft(UNIT_BROADCAST_STASH_SCOPE, UNIT_BROADCAST_STASH_ID, draft, now)
}

export function clearUnitBroadcastStash(): void {
  clearFillDraft(UNIT_BROADCAST_STASH_SCOPE, UNIT_BROADCAST_STASH_ID)
}
