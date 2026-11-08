import { describe, expect, it, vi } from 'vitest'
import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter'
import type { PersonHit } from '../smartSearchApi'
import { pickAllPeople, pickPerson, resolvePersonInFilter } from './personResolution'

const base: SmartSearchFilter = { intent: 'find', entity: 'events', source: 'both', person: 'יוסי', district: 'צפון' }
const levi: PersonHit = { id: '11111111-1111-4111-8111-111111111111', full_name: 'יוסי לוי', callsign: '411', volunteer_status: null }
const barak: PersonHit = { id: '22222222-2222-4222-8222-222222222222', full_name: 'יוסי ברק', callsign: '412', volunteer_status: null }

describe('resolvePersonInFilter', () => {
  it('one match becomes that person, with their או״ק for an admin archive', async () => {
    const r = await resolvePersonInFilter(base, 'admin', async () => [levi])
    expect(r.ambiguity).toBeNull()
    expect(r.filter).toMatchObject({ person: 'יוסי לוי', person_ids: [levi.id], person_callsigns: ['411'] })
  })
  it('several matches keep all of them and return the picker', async () => {
    const r = await resolvePersonInFilter(base, 'lead', async () => [levi, barak])
    expect(r.ambiguity).toEqual({ name: 'יוסי', candidates: [levi, barak] })
    expect(r.filter.person_ids).toEqual([levi.id, barak.id])
    expect(r.filter).not.toHaveProperty('person_callsigns')
  })
  it('no match, or a lookup failure, keeps the name as text', async () => {
    expect((await resolvePersonInFilter(base, 'admin', async () => [])).filter).toEqual(base)
    expect((await resolvePersonInFilter(base, 'admin', async () => Promise.reject(new Error('x')))).filter).toEqual(base)
  })
  it('does not look up again once resolved, or without a person', async () => {
    const resolve = vi.fn(async () => [levi])
    await resolvePersonInFilter({ ...base, person_ids: [levi.id] }, 'admin', resolve)
    await resolvePersonInFilter({ ...base, person: undefined }, 'admin', resolve)
    expect(resolve).not.toHaveBeenCalled()
  })
  it('picking narrows to one and picking all goes back', () => {
    const one = pickPerson(base, barak, 'admin')
    expect(one).toMatchObject({ person: 'יוסי ברק', person_ids: [barak.id], person_callsigns: ['412'] })
    const all = pickAllPeople(one, { name: 'יוסי', candidates: [levi, barak] }, 'admin')
    expect(all).toMatchObject({ person: 'יוסי', person_ids: [levi.id, barak.id] })
  })
})
