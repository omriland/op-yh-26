import { describe, expect, it } from 'vitest'
import { deriveFormLifecycle, emptyEventDraft, releaseAwareNotifyIds } from './eventForm'

describe('releaseAwareNotifyIds: nobody hears about a טיוטה', () => {
  it('sends nothing while the event is held', () => {
    expect(releaseAwareNotifyIds({ releasedNow: false, releasedBefore: false, changed: ['a'], all: ['a', 'b'] })).toEqual([])
  })

  it('the save that releases it tells every volunteer on it', () => {
    expect(releaseAwareNotifyIds({ releasedNow: true, releasedBefore: false, changed: [], all: ['a', 'b', 'a'] })).toEqual([
      'a',
      'b',
    ])
  })

  it('after that, only new assignments and first ק״מ, as before', () => {
    expect(releaseAwareNotifyIds({ releasedNow: true, releasedBefore: true, changed: ['b'], all: ['a', 'b'] })).toEqual(['b'])
  })
})

describe('deriveFormLifecycle', () => {
  it('a new form with nobody assigned reads טיוטה', () => {
    expect(deriveFormLifecycle(emptyEventDraft({ full_name: 'אחמ״ש', callsign: '1' })).status).toBe('draft')
  })
})
