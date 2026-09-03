import { describe, expect, it } from 'vitest'
import { shouldKeepLiveFormBoot } from './formDraftSurvival'

describe('shouldKeepLiveFormBoot', () => {
  it('keeps a ready form that already has typed content', () => {
    expect(shouldKeepLiveFormBoot({ loadState: 'ready', hasTypedDraft: true })).toBe(true)
  })

  it('does not keep loading, denied, or empty boots', () => {
    expect(shouldKeepLiveFormBoot({ loadState: 'loading', hasTypedDraft: true })).toBe(false)
    expect(shouldKeepLiveFormBoot({ loadState: 'denied', hasTypedDraft: true })).toBe(false)
    expect(shouldKeepLiveFormBoot({ loadState: 'ready', hasTypedDraft: false })).toBe(false)
  })
})
