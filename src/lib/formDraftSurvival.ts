/**
 * Shared boot-survival helpers for long forms.
 *
 * Supabase TOKEN_REFRESHED rebuilds `user` / `profile` object identity on tab
 * focus. Forms that depend on those objects in a load effect re-boot and wipe
 * typed fields. Prefer stable ids in effect deps, and skip reboot when a live
 * typed draft is already in memory.
 */

export function shouldKeepLiveFormBoot(input: {
  loadState: string
  hasTypedDraft: boolean
}): boolean {
  if (input.loadState !== 'ready') return false
  return input.hasTypedDraft
}
