import { describe, expect, it } from 'vitest'
import {
  SELF_ASSIGN_ON_CREATE_ERROR,
  createIncludesSelfAssign,
  isSelfAssignDisabledInPicker,
} from './eventForm'

describe('self-assign on event create', () => {
  it('detects when the lead is in the crew', () => {
    expect(createIncludesSelfAssign('lead', [{ responder_id: 'a' }, { responder_id: 'lead' }])).toBe(
      true,
    )
    expect(createIncludesSelfAssign('lead', [{ responder_id: 'a' }])).toBe(false)
  })

  it('disables the current user in the create picker, including admin+lead', () => {
    expect(isSelfAssignDisabledInPicker(true, 'me', 'me')).toBe(true)
    expect(isSelfAssignDisabledInPicker(true, 'me', 'other')).toBe(false)
    expect(isSelfAssignDisabledInPicker(false, 'me', 'me')).toBe(false)
    expect(isSelfAssignDisabledInPicker(true, undefined, 'me')).toBe(false)
  })

  it('keeps the Hebrew reject copy for the create save path', () => {
    expect(SELF_ASSIGN_ON_CREATE_ERROR).toBe('לא ניתן לשבץ את יוצר האירוע כמתנדב.')
  })
})
