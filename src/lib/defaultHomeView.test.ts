import { describe, expect, it } from 'vitest'
import { defaultHomeView } from './defaultHomeView'

describe('defaultHomeView', () => {
  it('sends אחמ״ש and admins to unit אירועים, not האירועים שלי', () => {
    expect(
      defaultHomeView({ manages: true, hasMineList: true, isAdmin: false }),
    ).toBe('events')
    expect(
      defaultHomeView({ manages: true, hasMineList: true, isAdmin: true }),
    ).toBe('events')
  })

  it('sends כונן-only users to האירועים שלי', () => {
    expect(
      defaultHomeView({ manages: false, hasMineList: true, isAdmin: false }),
    ).toBe('mine')
  })

  it('falls through to משתמשים / פרופיל when there is no event list', () => {
    expect(
      defaultHomeView({ manages: false, hasMineList: false, isAdmin: true }),
    ).toBe('users')
    expect(
      defaultHomeView({ manages: false, hasMineList: false, isAdmin: false }),
    ).toBe('profile')
  })
})
