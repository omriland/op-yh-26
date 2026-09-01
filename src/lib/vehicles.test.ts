import { describe, expect, it } from 'vitest'
import {
  SET_DEFAULT_VEHICLE_LABEL,
  isProfileVehicleEditing,
  ownVehicleWriteError,
  vehicleFieldsForSave,
  vehicleRemoveMode,
} from './vehicles'

describe('vehicleRemoveMode', () => {
  it('archives when the vehicle is attached to an event or shift', () => {
    expect(vehicleRemoveMode(true)).toBe('archive')
  })

  it('deletes when the vehicle is not attached to history', () => {
    expect(vehicleRemoveMode(false)).toBe('delete')
  })
})

describe('vehicleFieldsForSave', () => {
  it('requires both plate and model', () => {
    expect(vehicleFieldsForSave('', 'קורולה')).toEqual({
      error: 'יש להזין לוחית רישוי ודגם.',
    })
    expect(vehicleFieldsForSave('12-345-67', '  ')).toEqual({
      error: 'יש להזין לוחית רישוי ודגם.',
    })
  })

  it('canonicalizes the plate and trims the model', () => {
    expect(vehicleFieldsForSave('1234567', '  קורולה  ')).toEqual({
      plate_number: '12-345-67',
      model: 'קורולה',
    })
  })
})

describe('ownVehicleWriteError', () => {
  it('maps a duplicate plate to Hebrew', () => {
    expect(ownVehicleWriteError({ code: '23505' })).toBe(
      'לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.',
    )
  })

  it('falls back to a generic Hebrew error', () => {
    expect(ownVehicleWriteError(null)).toBe('שמירת הרכב נכשלה.')
    expect(ownVehicleWriteError({ message: '  ' })).toBe('שמירת הרכב נכשלה.')
  })
})

describe('SET_DEFAULT_VEHICLE_LABEL', () => {
  it('is the profile star tooltip', () => {
    expect(SET_DEFAULT_VEHICLE_LABEL).toBe('הגדר כרכב ברירת מחדל')
  })
})

describe('isProfileVehicleEditing', () => {
  it('keeps unsaved rows in edit mode', () => {
    expect(isProfileVehicleEditing({ key: 'new-1' }, null)).toBe(true)
  })

  it('edits a saved row only after the pencil selects it', () => {
    expect(isProfileVehicleEditing({ key: 'v1', id: 'v1' }, null)).toBe(false)
    expect(isProfileVehicleEditing({ key: 'v1', id: 'v1' }, 'v1')).toBe(true)
    expect(isProfileVehicleEditing({ key: 'v1', id: 'v1' }, 'v2')).toBe(false)
  })
})
