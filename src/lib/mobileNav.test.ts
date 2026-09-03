import { describe, expect, it } from 'vitest'
import { splitMobileNav } from './mobileNav'

function views(list: { view?: string }[]) {
  return list.map((entry) => entry.view)
}

describe('splitMobileNav', () => {
  it('keeps a responder set of three in the tab bar with no overflow', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'mine' },
      { view: 'my_shifts' },
      { view: 'contacts' },
    ])

    expect(views(tabs)).toEqual(['mine', 'my_shifts', 'contacts'])
    expect(more).toEqual([])
  })

  it('keeps מפה in the responder tab bar after אנשי קשר', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'map' },
      { view: 'mine' },
      { view: 'contacts' },
      { view: 'my_shifts' },
    ])

    expect(views(tabs)).toEqual(['mine', 'my_shifts', 'contacts', 'map'])
    expect(more).toEqual([])
  })

  it('fits exactly four destinations in the bar', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'mine' },
      { view: 'events' },
      { view: 'users' },
      { view: 'my_shifts' },
    ])

    expect(views(tabs)).toEqual(['events', 'mine', 'users', 'my_shifts'])
    expect(more).toEqual([])
  })

  it('keeps daily work for a shift-lead and parks the rest behind עוד', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'contacts' },
      { view: 'map' },
      { view: 'reports' },
      { view: 'shifts' },
      { view: 'events' },
      { view: 'my_shifts' },
      { view: 'mine' },
    ])

    expect(views(tabs)).toEqual(['events', 'mine', 'my_shifts'])
    expect(views(more)).toEqual(['shifts', 'contacts', 'map', 'reports'])
  })

  it('keeps ניהול in the bar for an admin and demotes personal shifts', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'mine' },
      { view: 'my_shifts' },
      { view: 'contacts' },
      { view: 'events' },
      { view: 'shifts' },
      { view: 'map' },
      { view: 'users' },
    ])

    expect(views(tabs)).toEqual(['events', 'mine', 'users'])
    expect(views(more)).toEqual(['my_shifts', 'shifts', 'contacts', 'map'])
  })

  it('gives a manager-only admin events, ניהול, and unit shifts', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'contacts' },
      { view: 'events' },
      { view: 'shifts' },
      { view: 'map' },
      { view: 'users' },
    ])

    expect(views(tabs)).toEqual(['events', 'users', 'shifts'])
    expect(views(more)).toEqual(['contacts', 'map'])
  })

  it('parks a SuperAdmin submenu in עוד instead of the tab bar', () => {
    const { tabs, more } = splitMobileNav([
      { view: 'events' },
      { view: 'mine' },
      { view: 'users' },
      {
        menuId: 'super_admin',
        children: [{ view: 'feedback' }, { view: 'event_locations' }, { view: 'event_audit' }],
      },
    ])

    expect(views(tabs)).toEqual(['events', 'mine', 'users'])
    expect(more).toHaveLength(1)
    expect(more[0]?.menuId).toBe('super_admin')
  })
})
