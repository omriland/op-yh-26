import { describe, expect, it } from 'vitest'
import { cockpitPath, cockpitUrlAction, parseCockpitPath, withPathname } from './cockpitPath'

describe('parseCockpitPath', () => {
  it('reads /cockpit and /cockpit/:eventId', () => {
    expect(parseCockpitPath('/cockpit')).toEqual({})
    expect(parseCockpitPath('/cockpit/')).toEqual({})
    expect(parseCockpitPath('/cockpit/evt-9')).toEqual({ eventId: 'evt-9' })
  })

  it('ignores other app paths', () => {
    expect(parseCockpitPath('/')).toBeNull()
    expect(parseCockpitPath('/events')).toBeNull()
    expect(parseCockpitPath('/cockpit/evt-9/edit')).toBeNull()
  })
})

describe('cockpitPath', () => {
  it('builds the public cockpit href', () => {
    expect(cockpitPath()).toBe('/cockpit')
    expect(cockpitPath('evt-9')).toBe('/cockpit/evt-9')
  })
})

describe('cockpitUrlAction', () => {
  it('pushes when entering the cockpit, replaces when the selected event changes', () => {
    expect(cockpitUrlAction('/', undefined, true)).toEqual({
      method: 'push',
      path: '/cockpit',
    })
    expect(cockpitUrlAction('/cockpit', 'evt-9', true)).toEqual({
      method: 'replace',
      path: '/cockpit/evt-9',
    })
    expect(cockpitUrlAction('/cockpit/evt-9', 'evt-9', true)).toBeNull()
  })

  it('replaces back to / when leaving the cockpit', () => {
    expect(cockpitUrlAction('/cockpit/evt-9', 'evt-9', false)).toEqual({
      method: 'replace',
      path: '/',
    })
    expect(cockpitUrlAction('/', undefined, false)).toBeNull()
  })
})

describe('withPathname', () => {
  it('keeps query and hash', () => {
    expect(withPathname('https://yahpz.com/cockpit?x=1#y', '/cockpit/evt-9')).toBe(
      '/cockpit/evt-9?x=1#y',
    )
  })
})
