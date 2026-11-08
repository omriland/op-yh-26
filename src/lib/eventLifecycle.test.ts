import { describe, expect, it } from 'vitest'
import type { EventListItem, EventResponderSummary } from './events'
import {
  EVENT_LIFECYCLE_ORDER,
  RESPONDER_CAN_LOG_WHILE_LEAD_FILLS,
  eventLifecycle,
  formLifecycle,
  lifecycleFilters,
  lifecycleMatches,
  lifecycleStamp,
  lifecycleStampTip,
  parseLifecycleFilter,
  statusAudienceForRoles,
  storedStatusesForLifecycle,
  type EventLifecycle,
  type LifecycleFormFacts,
} from './eventLifecycle'
import { deriveStoredEventStatus } from './eventStatus'
import { eventReleasedToResponders as edgeReleased } from '../../supabase/functions/_shared/eventRelease'
import { eventReleasedToResponders } from './eventResponderRelease'
import type { ParticipationStatus } from './status'

function responder(partial: Partial<EventResponderSummary> = {}): EventResponderSummary {
  return {
    id: 'r1',
    responder_id: 'u1',
    status: 'pending',
    total_km: 12,
    started_at: null,
    ended_at: null,
    profile: { full_name: 'דנה', callsign: 'A1', vehicles: [{ archived: false }] },
    ...partial,
  }
}

/** A released event with every lead field filled. */
function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    shift_lead_id: 'lead',
    event_date: '2026-11-08',
    police_event_id: '48201',
    patrol_callsign: 'אביב 411',
    patrol_callsign_prefix: 'אביב',
    patrol_callsign_number: '411',
    started_at: '2026-11-08T06:00:00',
    ended_at: '2026-11-08T07:00:00',
    location: 'מחלף אייל',
    status: 'in_progress',
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: { name: 'שלוחה צפון' },
    event_type: { name: 'פינוי רכב' },
    road: { name: 'כביש 6' },
    shift_lead: null,
    last_saved: null,
    shift: null,
    shared_treated: [],
    responders: [responder()],
    ...partial,
  }
}

const two = (a: ParticipationStatus, b: ParticipationStatus) => [
  responder({ id: 'r1', responder_id: 'u1', status: a }),
  responder({ id: 'r2', responder_id: 'u2', status: b }),
]

describe('eventLifecycle: the אחמ״ש builds, completes, then the volunteers document', () => {
  it('טיוטה: nobody assigned yet', () => {
    expect(eventLifecycle(event({ responders: [], status: 'draft' })).status).toBe('draft')
  })

  it.each([
    ['מספר אירוע', { police_event_id: '  ' }],
    ['סוג אירוע', { event_type: null }],
    ['כביש', { road: null }],
    ['או״ק', { patrol_callsign_prefix: 'אביב', patrol_callsign_number: '' }],
  ])('טיוטה: a volunteer is on it but %s is empty, so it is not released', (_, patch) => {
    expect(eventLifecycle(event(patch as Partial<EventListItem>)).status).toBe('draft')
  })

  it('טיוטה wins over everything after it, even with a volunteer done', () => {
    expect(eventLifecycle(event({ road: null, responders: two('done', 'done') })).status).toBe('draft')
  })

  it.each([
    ['ק״מ', { responders: [responder({ total_km: null })] }],
    ['שעת סיום', { ended_at: null }],
    ['שעת התחלה', { started_at: null }],
    ['מיקום', { location: ' ' }],
    ['שלוחה', { district: null }],
  ])('פרטים חסרים: released but the אחמ״ש still owes %s', (_, patch) => {
    expect(eventLifecycle(event(patch as Partial<EventListItem>)).status).toBe('missing_details')
  })

  it('פרטים חסרים comes before the volunteers: all of them done and ק״מ missing is still פרטים חסרים', () => {
    const row = event({ status: 'partial', responders: [responder({ status: 'done', total_km: null })] })
    expect(eventLifecycle(row).status).toBe('missing_details')
  })

  it('a volunteer with no car owes no ק״מ', () => {
    const row = event({ responders: [responder({ total_km: null, profile: { full_name: 'דנה', callsign: 'A1', vehicles: [] } })] })
    expect(eventLifecycle(row).status).toBe('awaiting_responder')
  })

  it('the server ק״מ flag wins over what the client can see (a כונן cannot see teammates’ cars)', () => {
    const hidden = { full_name: 'דנה', callsign: 'A1', vehicles: [] }
    expect(
      eventLifecycle(event({ lead_km_owed: true, responders: [responder({ total_km: null, profile: hidden })] })).status,
    ).toBe('missing_details')
    expect(
      eventLifecycle(event({ lead_km_owed: false, responders: [responder({ total_km: null })] })).status,
    ).toBe('awaiting_responder')
  })

  it('ממתין למתנדב: lead part done, nobody finished (a saved draft is not finished)', () => {
    expect(eventLifecycle(event({ responders: two('pending', 'in_progress') }))).toEqual({
      status: 'awaiting_responder',
      done: 0,
      total: 2,
    })
  })

  it('תועד חלקית: X of Y finished', () => {
    expect(eventLifecycle(event({ responders: two('done', 'pending') }))).toEqual({
      status: 'partial',
      done: 1,
      total: 2,
    })
  })

  it('תועד: every volunteer finished and every lead field is filled', () => {
    expect(eventLifecycle(event({ status: 'done', responders: two('done', 'done') })).status).toBe('done')
  })

  it('a cancelled event with nobody assigned is תועד once stored done (after שעת סיום), else טיוטה', () => {
    expect(eventLifecycle(event({ is_cancelled: true, responders: [], status: 'done' })).status).toBe('done')
    expect(eventLifecycle(event({ is_cancelled: true, responders: [], status: 'draft' })).status).toBe('draft')
  })

  it('shift-born: never טיוטה or פרטים חסרים; תועד once the report is done with פירוט הטיפול', () => {
    const shift = { origin: 'shift' as const, police_event_id: null, road: null, event_type: null, district: null }
    expect(eventLifecycle(event({ ...shift, status: 'in_progress' })).status).toBe('awaiting_responder')
    expect(eventLifecycle(event({ ...shift, status: 'done' })).status).toBe('awaiting_responder')
    expect(eventLifecycle(event({ ...shift, status: 'done', treatment_detail: 'חילוץ' })).status).toBe('done')
  })
})

describe('lifecycleStamp: two points of view', () => {
  const states: EventLifecycle[] = [...EVENT_LIFECYCLE_ORDER]

  it('uses the user’s words for the אחמ״ש (and admins)', () => {
    expect(states.map((status) => lifecycleStamp(status, 'lead').label)).toEqual([
      'טיוטה',
      'פרטים חסרים',
      'ממתין למתנדב',
      'תועד חלקית',
      'תועד',
    ])
  })

  it('a כונן reads פרטים חסרים as ממתין למילוי פרטים, and the rest the same', () => {
    expect(lifecycleStamp('missing_details', 'responder')).toEqual({ label: 'ממתין למילוי פרטים', tone: 'pending' })
    for (const status of ['awaiting_responder', 'partial', 'done'] as const) {
      expect(lifecycleStamp(status, 'responder')).toEqual(lifecycleStamp(status, 'lead'))
    }
  })

  it('tones: טיוטה dashed draft, פרטים חסרים alert for the lead, then pending · partial · done', () => {
    expect(states.map((status) => lifecycleStamp(status, 'lead').tone)).toEqual([
      'draft',
      'alert',
      'pending',
      'partial',
      'done',
    ])
  })

  it('תועד חלקית carries X/Y', () => {
    expect(lifecycleStamp({ status: 'partial', done: 1, total: 3 }, 'lead')).toEqual({
      label: 'תועד חלקית',
      tone: 'partial',
      progress: { done: 1, total: 3 },
    })
    expect(lifecycleStamp({ status: 'done', done: 3, total: 3 }, 'lead').progress).toBeUndefined()
  })

  it('admins, super admins and shift-leads read the אחמ״ש view; everyone else the כונן view', () => {
    expect(statusAudienceForRoles(['admin'])).toBe('lead')
    expect(statusAudienceForRoles(['super_admin'])).toBe('lead')
    expect(statusAudienceForRoles(['responder', 'shift_lead'])).toBe('lead')
    expect(statusAudienceForRoles(['responder'])).toBe('responder')
    expect(statusAudienceForRoles([])).toBe('responder')
  })
})

describe('lifecycleStampTip', () => {
  it('tells the אחמ״ש what is missing, with שעת סיום split out', () => {
    const row = event({ ended_at: null, responders: [responder({ total_km: null, profile: { full_name: 'דנה', callsign: 'A1', vehicles: [{ archived: false }] } })] })
    expect(lifecycleStampTip(row, 'lead')).toBe('חסרים: ק״מ · שעת סיום\nממתין לתיעוד: דנה')
  })

  it('names who has not documented on תועד חלקית', () => {
    const row = event({
      responders: [
        responder({ id: 'r1', status: 'done', profile: { full_name: 'דנה', callsign: 'A1' } }),
        responder({ id: 'r2', status: 'pending', profile: { full_name: 'יוסי', callsign: 'A2' } }),
      ],
    })
    expect(lifecycleStampTip(row, 'lead')).toBe('ממתין לתיעוד: יוסי')
  })

  it('tells a כונן whose part is open that they can document already, and never lists lead fields', () => {
    const row = event({ ended_at: null, responders: [responder({ responder_id: 'me', status: 'pending' })] })
    expect(lifecycleStampTip(row, 'responder', 'me')).toBe(RESPONDER_CAN_LOG_WHILE_LEAD_FILLS)
    const done = event({ ended_at: null, responders: [responder({ responder_id: 'me', status: 'done' })] })
    expect(lifecycleStampTip(done, 'responder', 'me')).toBeNull()
  })
})

describe('status filters', () => {
  it('the אחמ״ש menu lists all five; a כונן’s has no טיוטה and uses their wording', () => {
    expect(lifecycleFilters('lead').map((row) => row.value)).toEqual([
      'all',
      'missing_details',
      'awaiting_responder',
      'partial',
      'done',
      'draft',
    ])
    const mine = lifecycleFilters('responder')
    expect(mine.map((row) => row.value)).not.toContain('draft')
    expect(mine.find((row) => row.value === 'missing_details')?.label).toBe('ממתין למילוי פרטים')
  })

  it('every tip uses gershayim and no exclamation marks', () => {
    for (const row of [...lifecycleFilters('lead'), ...lifecycleFilters('responder')]) {
      if (!row.tip) continue
      expect(row.tip).not.toMatch(/["!—]/)
      expect(row.tip).not.toMatch(/אחמש/)
    }
  })

  it('reads saved views from before this vocabulary', () => {
    expect(parseLifecycleFilter('in_progress')).toBe('awaiting_responder')
    expect(parseLifecycleFilter('partial')).toBe('partial')
    expect(parseLifecycleFilter('done')).toBe('done')
    expect(parseLifecycleFilter('draft')).toBe('draft')
    expect(parseLifecycleFilter('missing_details')).toBe('missing_details')
    expect(parseLifecycleFilter('nonsense')).toBe('all')
    expect(parseLifecycleFilter(undefined)).toBe('all')
  })

  it('matches exactly one lifecycle', () => {
    const row = event({ responders: two('done', 'pending') })
    expect(lifecycleMatches('all', row)).toBe(true)
    expect(lifecycleMatches('partial', row)).toBe(true)
    expect(lifecycleMatches('done', row)).toBe(false)
  })

  it('the server-side stored-status narrowing never drops an event the page would keep', () => {
    // Every combination of release, lead gaps and volunteer progress, with the
    // stored status the database computes for it.
    const statuses: ParticipationStatus[] = ['pending', 'in_progress', 'done']
    const mixes: ParticipationStatus[][] = [[]]
    for (const a of statuses) {
      mixes.push([a])
      for (const b of statuses) mixes.push([a, b])
    }
    for (const released of [true, false]) {
      for (const ended of [true, false]) {
        for (const kmOwed of [true, false]) {
          for (const location of ['מחלף', '']) {
            for (const mix of mixes) {
              const responders = mix.map((status, index) =>
                responder({ id: `r${index}`, status, total_km: kmOwed ? null : 5 }),
              )
              const endedAt = ended ? '2026-11-08T07:00:00' : null
              const stored =
                mix.length === 0
                  ? 'draft'
                  : deriveStoredEventStatus({
                      endedAt,
                      responders: responders.map((row) => ({ status: row.status, totalKm: row.total_km })),
                    })
              const row = event({
                status: stored,
                road: released ? { name: 'כביש 6' } : null,
                ended_at: endedAt,
                location,
                responders,
              })
              const life = eventLifecycle(row).status
              const allowed = storedStatusesForLifecycle(life)
              expect(allowed === null || allowed.includes(stored), `${life} from stored ${stored}`).toBe(true)
            }
          }
        }
      }
    }
  })
})

describe('formLifecycle: the event form header reads what is typed', () => {
  const facts = (patch: Partial<LifecycleFormFacts> = {}): LifecycleFormFacts => ({
    origin: 'manual',
    storedStatus: 'in_progress',
    policeEventId: '48201',
    hasEventType: true,
    hasRoad: true,
    patrolCallsign: 'אביב 411',
    patrolCallsignPrefix: 'אביב',
    patrolCallsignNumber: '411',
    hasDistrict: true,
    location: 'מחלף',
    startTime: '06:00',
    endTime: '07:00',
    responders: [{ status: 'pending', kmOwed: false }],
    ...patch,
  })

  it('agrees with the list for the same facts', () => {
    expect(formLifecycle(facts({ responders: [] })).status).toBe('draft')
    expect(formLifecycle(facts({ hasEventType: false })).status).toBe('draft')
    expect(formLifecycle(facts({ endTime: '' })).status).toBe('missing_details')
    expect(formLifecycle(facts({ responders: [{ status: 'pending', kmOwed: true }] })).status).toBe(
      'missing_details',
    )
    expect(formLifecycle(facts()).status).toBe('awaiting_responder')
    expect(
      formLifecycle(facts({ responders: [{ status: 'done', kmOwed: false }, { status: 'pending', kmOwed: false }] })),
    ).toEqual({ status: 'partial', done: 1, total: 2 })
    expect(formLifecycle(facts({ responders: [{ status: 'done', kmOwed: false }] })).status).toBe('done')
  })
})

describe('release rule: web, edge function and SQL agree', () => {
  // Same cases as scripts/event-lifecycle/test/release.sql.
  const cases: [string, Parameters<typeof edgeReleased>[0], boolean][] = [
    ['shift-born with nothing filled', { origin: 'shift' }, true],
    ['all four filled', { origin: 'manual', police_event_id: '9001', event_type_id: 't', road_id: 'r', patrol_callsign_number: '411' }, true],
    ['blank מספר אירוע', { origin: 'manual', police_event_id: ' ', event_type_id: 't', road_id: 'r', patrol_callsign_number: '411' }, false],
    ['missing סוג אירוע', { origin: 'manual', police_event_id: '9001', road_id: 'r', patrol_callsign_number: '411' }, false],
    ['missing כביש', { origin: 'manual', police_event_id: '9001', event_type_id: 't', patrol_callsign_number: '411' }, false],
    ['prefix without a number', { origin: 'manual', police_event_id: '9001', event_type_id: 't', road_id: 'r', patrol_callsign_prefix: 'אביב', patrol_callsign: 'אביב 411' }, false],
    ['legacy callsign with digits', { origin: 'manual', police_event_id: '9001', event_type_id: 't', road_id: 'r', patrol_callsign: 'אביב 411' }, true],
    ['legacy callsign without digits', { origin: 'manual', police_event_id: '9001', event_type_id: 't', road_id: 'r', patrol_callsign: 'אביב' }, false],
  ]

  it.each(cases)('%s', (_, row, expected) => {
    expect(edgeReleased(row)).toBe(expected)
    expect(
      eventReleasedToResponders({
        origin: row.origin,
        policeEventId: row.police_event_id,
        hasEventType: Boolean(row.event_type_id),
        hasRoad: Boolean(row.road_id),
        patrolCallsign: row.patrol_callsign,
        patrolCallsignPrefix: row.patrol_callsign_prefix,
        patrolCallsignNumber: row.patrol_callsign_number,
      }),
    ).toBe(expected)
  })
})
