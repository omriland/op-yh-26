import { describe, expect, it } from 'vitest'
import {
  ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR,
  isAssignedVolunteerEventEditBlocked,
} from './assignedVolunteerEventEdit'

describe('isAssignedVolunteerEventEditBlocked', () => {
  it('blocks when the viewer is a responder on the event', () => {
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: 'me',
        responderIds: ['a', 'me'],
        secondaryLeadIds: [],
      }),
    ).toBe(true)
  })

  it('blocks when the viewer is a secondary אחמ״ש, even without a responder row', () => {
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: 'me',
        responderIds: ['a'],
        secondaryLeadIds: ['me'],
      }),
    ).toBe(true)
  })

  it('blocks combo assignment (responder and secondary)', () => {
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: 'me',
        responderIds: ['me'],
        secondaryLeadIds: ['me'],
      }),
    ).toBe(true)
  })

  it('does not block a lead who is only the main אחמ״ש', () => {
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: 'lead',
        responderIds: ['a', 'b'],
        secondaryLeadIds: ['other'],
      }),
    ).toBe(false)
  })

  it('does not block when ids are missing or blank', () => {
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: 'me',
        responderIds: [],
        secondaryLeadIds: [],
      }),
    ).toBe(false)
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: undefined,
        responderIds: ['me'],
        secondaryLeadIds: ['me'],
      }),
    ).toBe(false)
    expect(
      isAssignedVolunteerEventEditBlocked({
        viewerId: '  ',
        responderIds: ['me'],
        secondaryLeadIds: [],
      }),
    ).toBe(false)
  })

  it('keeps the exact Hebrew reject copy', () => {
    expect(ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR).toBe(
      'לא ניתן לערוך אירוע עליו אתה מוצב כמתנדב. לעדכון פרטים יש לפנות לאחמ"ש המזין או למנהל מערכת',
    )
  })
})
