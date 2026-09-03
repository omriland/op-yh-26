import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isForeignShiftLeadEvent } from './foreignEventEdit'
import {
  EVENT_SECONDARY_LEADS_EMBED,
  MAIN_LEAD_LABEL,
  MAIN_LEAD_LABEL_SHORT,
  SECONDARY_LEAD_LABEL,
  SECONDARY_LEAD_LOCKED_HINT,
  canChangeEventMainLead,
  canManageSecondaryLeads,
  canRemoveSecondaryLead,
  createTimeCreatorSecondary,
  eventLeadFieldLabel,
  filterShiftLeadPicker,
  formatLeadPerson,
  formatLeadsCaption,
  formatListLeadCaption,
  formatListLeadTooltip,
  mapSecondaryLeadRows,
  reassignMainLeads,
  shouldAutoLockSecondary,
  type SecondaryLead,
} from './eventShiftLeads'

const lead = (
  user_id: string,
  extra: Partial<SecondaryLead> = {},
): SecondaryLead => ({
  user_id,
  locked: false,
  full_name: user_id,
  callsign: user_id,
  ...extra,
})

describe('canManageSecondaryLeads', () => {
  it('allows shift_lead, admin, and super_admin — not responder-only', () => {
    expect(canManageSecondaryLeads(['shift_lead'])).toBe(true)
    expect(canManageSecondaryLeads(['admin'])).toBe(true)
    expect(canManageSecondaryLeads(['super_admin'])).toBe(true)
    expect(canManageSecondaryLeads(['admin', 'shift_lead'])).toBe(true)
    expect(canManageSecondaryLeads(['responder'])).toBe(false)
    expect(canManageSecondaryLeads([])).toBe(false)
  })
})

describe('canChangeEventMainLead', () => {
  it('lets a creating אחמ״ש pick main before secondaries exist', () => {
    expect(
      canChangeEventMainLead({
        roles: ['shift_lead'],
        eventExists: false,
        viewerIsCurrentMain: true,
        hasSecondaries: false,
      }),
    ).toBe(true)
  })

  it('lets the current main transfer once while there are no secondaries', () => {
    expect(
      canChangeEventMainLead({
        roles: ['shift_lead'],
        eventExists: true,
        viewerIsCurrentMain: true,
        hasSecondaries: false,
      }),
    ).toBe(true)
  })

  it('blocks a non-admin after secondaries exist or when the viewer is not main', () => {
    expect(
      canChangeEventMainLead({
        roles: ['shift_lead'],
        eventExists: true,
        viewerIsCurrentMain: true,
        hasSecondaries: true,
      }),
    ).toBe(false)
    expect(
      canChangeEventMainLead({
        roles: ['shift_lead'],
        eventExists: true,
        viewerIsCurrentMain: false,
        hasSecondaries: false,
      }),
    ).toBe(false)
    expect(
      canChangeEventMainLead({
        roles: ['responder'],
        eventExists: false,
        viewerIsCurrentMain: true,
        hasSecondaries: false,
      }),
    ).toBe(false)
  })

  it('lets admin and super_admin change main after the event exists', () => {
    expect(
      canChangeEventMainLead({
        roles: ['admin'],
        eventExists: true,
        viewerIsCurrentMain: false,
        hasSecondaries: true,
      }),
    ).toBe(true)
    expect(
      canChangeEventMainLead({
        roles: ['super_admin'],
        eventExists: true,
        viewerIsCurrentMain: false,
        hasSecondaries: true,
      }),
    ).toBe(true)
  })
})

describe('canRemoveSecondaryLead', () => {
  it('allows unlocked rows for leads/admins and never locked rows', () => {
    expect(canRemoveSecondaryLead({ roles: ['shift_lead'], locked: false })).toBe(true)
    expect(canRemoveSecondaryLead({ roles: ['admin'], locked: false })).toBe(true)
    expect(canRemoveSecondaryLead({ roles: ['super_admin'], locked: false })).toBe(true)
    expect(canRemoveSecondaryLead({ roles: ['super_admin'], locked: true })).toBe(false)
    expect(canRemoveSecondaryLead({ roles: ['shift_lead'], locked: true })).toBe(false)
    expect(canRemoveSecondaryLead({ roles: ['responder'], locked: false })).toBe(false)
  })
})

describe('foreign-edit popup vs main/secondary', () => {
  it('skips the confirm only for the main אחמ״ש', () => {
    expect(isForeignShiftLeadEvent({ viewerId: 'main', shiftLeadId: 'main' })).toBe(false)
    expect(isForeignShiftLeadEvent({ viewerId: 'secondary', shiftLeadId: 'main' })).toBe(true)
    expect(isForeignShiftLeadEvent({ viewerId: 'other-lead', shiftLeadId: 'main' })).toBe(true)
  })
})

describe('shouldAutoLockSecondary', () => {
  it('locks a non-main אחמ״ש only after a real persist', () => {
    expect(
      shouldAutoLockSecondary({
        viewerId: 'dana',
        mainLeadId: 'omri',
        persistedFieldChange: true,
        viewerHasShiftLead: true,
      }),
    ).toBe(true)
  })

  it('does not add on open, cancel, ביטול, or confirm-without-change', () => {
    expect(
      shouldAutoLockSecondary({
        viewerId: 'dana',
        mainLeadId: 'omri',
        persistedFieldChange: false,
        viewerHasShiftLead: true,
      }),
    ).toBe(false)
  })

  it('does not add the main or a viewer without shift_lead', () => {
    expect(
      shouldAutoLockSecondary({
        viewerId: 'omri',
        mainLeadId: 'omri',
        persistedFieldChange: true,
        viewerHasShiftLead: true,
      }),
    ).toBe(false)
    expect(
      shouldAutoLockSecondary({
        viewerId: 'admin-only',
        mainLeadId: 'omri',
        persistedFieldChange: true,
        viewerHasShiftLead: false,
      }),
    ).toBe(false)
  })
})

describe('createTimeCreatorSecondary', () => {
  it('sets the creating אחמ״ש as a removable secondary when they pick another main', () => {
    expect(createTimeCreatorSecondary({ creatorId: 'omri', mainLeadId: 'dana' })).toEqual({
      user_id: 'omri',
      locked: false,
    })
  })

  it('does not add the creator when they stay main', () => {
    expect(createTimeCreatorSecondary({ creatorId: 'omri', mainLeadId: 'omri' })).toBeNull()
  })
})

describe('reassignMainLeads', () => {
  it('moves the new main out of secondaries and demotes the old main', () => {
    const next = reassignMainLeads({
      previousMainId: 'omri',
      nextMainId: 'dana',
      previousMain: { full_name: 'עמרי', callsign: 'Admin' },
      secondaries: [lead('dana', { full_name: 'דנה', callsign: 'D1' }), lead('gil')],
    })
    expect(next.mainId).toBe('dana')
    expect(next.secondaries.map((row) => row.user_id)).toEqual(['gil', 'omri'])
    expect(next.secondaries.find((row) => row.user_id === 'omri')).toMatchObject({
      user_id: 'omri',
      locked: false,
      full_name: 'עמרי',
      callsign: 'Admin',
    })
  })

  it('keeps a locked old main locked when they are demoted', () => {
    const next = reassignMainLeads({
      previousMainId: 'omri',
      nextMainId: 'dana',
      previousMain: { full_name: 'עמרי', callsign: 'Admin' },
      previousMainLocked: true,
      secondaries: [],
    })
    expect(next.secondaries).toEqual([
      lead('omri', { locked: true, full_name: 'עמרי', callsign: 'Admin' }),
    ])
  })

  it('is a no-op when the main does not change', () => {
    const secondaries = [lead('gil')]
    expect(
      reassignMainLeads({
        previousMainId: 'omri',
        nextMainId: 'omri',
        previousMain: { full_name: 'עמרי', callsign: 'Admin' },
        secondaries,
      }),
    ).toEqual({ mainId: 'omri', secondaries })
  })
})

describe('filterShiftLeadPicker', () => {
  const people = [
    { id: 'a', full_name: 'דנה כהן', callsign: 'D1' },
    { id: 'b', full_name: 'עמרי לנדמן', callsign: 'Admin' },
  ]

  it('drops excluded ids and matches name or או״ק', () => {
    expect(filterShiftLeadPicker(people, ['a'], '').map((row) => row.id)).toEqual(['b'])
    expect(filterShiftLeadPicker(people, [], 'דנה').map((row) => row.id)).toEqual(['a'])
    expect(filterShiftLeadPicker(people, [], 'admin').map((row) => row.id)).toEqual(['b'])
  })
})

describe('mapSecondaryLeadRows', () => {
  it('maps nested profile rows and drops incomplete ids', () => {
    expect(
      mapSecondaryLeadRows([
        {
          user_id: 'dana',
          locked: true,
          profile: { full_name: 'דנה', callsign: 'D1' },
        },
        { user_id: '  ' },
      ]),
    ).toEqual([
      { user_id: 'dana', locked: true, added_at: undefined, full_name: 'דנה', callsign: 'D1' },
    ])
  })
})

describe('lead copy', () => {
  it('uses אחמ״ש until a secondary exists, then אחמ״ש ראשי / אחמ״ש משני', () => {
    expect(eventLeadFieldLabel(false)).toBe(MAIN_LEAD_LABEL_SHORT)
    expect(eventLeadFieldLabel(true)).toBe(MAIN_LEAD_LABEL)
    expect(SECONDARY_LEAD_LABEL).toBe('אחמ״ש משני')
    expect(SECONDARY_LEAD_LOCKED_HINT).toBe('נוסף אוטומטית בעריכה — לא ניתן להסיר')
  })

  it('formats name · או״ק and joins secondaries for detail / form / reel', () => {
    expect(formatLeadPerson({ full_name: 'דנה כהן', callsign: 'D1' })).toBe('דנה כהן · D1')
    expect(
      formatLeadsCaption(
        { full_name: 'דנה כהן', callsign: 'D1' },
        [{ full_name: 'עמרי', callsign: 'Admin' }],
      ),
    ).toBe('דנה כהן · D1 · עמרי · Admin')
  })

  it('lists main + overflow count, not secondary names', () => {
    const main = { full_name: 'דנה כהן', callsign: 'D1' }
    const secondaries = [
      { full_name: 'עמרי', callsign: 'Admin' },
      { full_name: 'גיא', callsign: 'G1' },
    ]
    expect(formatListLeadCaption(main, secondaries, { overflowCount: true })).toBe(
      'דנה כהן · D1 +2',
    )
    expect(formatListLeadCaption(main, secondaries)).toBe('דנה כהן · D1')
    expect(formatListLeadTooltip(secondaries)).toBe('עמרי · Admin · גיא · G1')
  })
})

describe('event_secondary_leads migration', () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations/20260903140000_event_secondary_leads.sql'),
    'utf8',
  )

  it('keeps main on events.shift_lead_id and adds a secondary table with lock + RLS', () => {
    expect(sql).toContain('create table public.event_secondary_leads')
    expect(sql).toContain('locked boolean not null default false')
    expect(sql).toContain("primary key (event_id, user_id)")
    expect(sql).toContain('list_shift_lead_profiles')
    expect(sql).toContain('upsert_locked_secondary_lead')
    expect(sql).toContain('רק מנהל יכול להחליף אחמ״ש ראשי.')
    expect(sql).toContain('לא ניתן להסיר אחמ״ש משני שננעל בעריכה.')
    expect(EVENT_SECONDARY_LEADS_EMBED).toContain('profiles!event_secondary_leads_user_id_fkey')
  })
})
