import { describe, expect, it } from 'vitest'
import { unlinkedPhotosNote } from './eventVehiclePhotos'
import { vehiclePhotosIssue } from './eventSaveRules'

const plate = (plate_number: string) => ({ plate_number }) as Parameters<typeof vehiclePhotosIssue>[0][number]

describe('photo prompt with photos that have no vehicle', () => {
  it('says so when the person has an unlinked photo', () => {
    const issue = vehiclePhotosIssue([plate('12-345-67')], new Set(), new Set(), 1)
    expect(issue?.note).toBe('יש לך תמונה אחת ללא שיוך לרכב. כדי לשייך: חזרה לעריכה, פתיחת התמונה ובחירת הרכב.')
  })

  it('counts several', () => {
    expect(unlinkedPhotosNote(3)).toMatch(/^יש לך 3 תמונות ללא שיוך לרכב\./)
  })

  it('adds nothing when every photo is linked', () => {
    expect(vehiclePhotosIssue([plate('12-345-67')], new Set(), new Set(), 0)?.note).toBeUndefined()
    expect(unlinkedPhotosNote(0)).toBeNull()
  })

  it('still skips the prompt when the vehicle has a photo', () => {
    expect(vehiclePhotosIssue([plate('12-345-67')], new Set(['1234567']), new Set(), 2)).toBeNull()
  })
})
