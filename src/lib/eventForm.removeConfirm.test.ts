import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  eventResponderHasFilledFields,
  eventResponderRemoveConfirm,
  NEW_RESPONDER_EMERGENCY_MEANS,
  type ResponderDraft,
} from './eventForm'

const srcDir = dirname(fileURLToPath(import.meta.url))

function row(overrides: Partial<ResponderDraft> = {}): ResponderDraft {
  return {
    key: 'r1',
    assignmentId: 'a1',
    responder_id: 'r1',
    full_name: 'דנה',
    callsign: '12',
    start_time: '',
    end_time: '',
    total_km: '',
    emergency_means: false,
    treated: [],
    status: 'pending',
    hasOwnedData: false,
    expanded: false,
    hasVehicle: true,
    ...overrides,
  }
}

describe('eventResponderHasFilledFields', () => {
  it('is false for an empty assignment', () => {
    expect(eventResponderHasFilledFields(row())).toBe(false)
  })

  it('is true after any single lead field', () => {
    expect(eventResponderHasFilledFields(row({ start_time: '08:00' }))).toBe(true)
    expect(eventResponderHasFilledFields(row({ end_time: '09:00' }))).toBe(true)
    expect(eventResponderHasFilledFields(row({ total_km: '12' }))).toBe(true)
    expect(eventResponderHasFilledFields(row({ emergency_means: true }))).toBe(true)
    expect(
      eventResponderHasFilledFields(row({ treated: [{ vehicle_kind_id: 'car', quantity: 1 }] })),
    ).toBe(true)
    expect(eventResponderHasFilledFields(row({ hasOwnedData: true }))).toBe(true)
  })

  it('ignores km when the responder has no vehicle', () => {
    expect(eventResponderHasFilledFields(row({ total_km: '12', hasVehicle: false }))).toBe(false)
  })

  it('ignores the default אמצעים on a freshly added assignment', () => {
    expect(
      eventResponderHasFilledFields(
        row({ assignmentId: undefined, emergency_means: NEW_RESPONDER_EMERGENCY_MEANS }),
      ),
    ).toBe(false)
    expect(
      eventResponderHasFilledFields(row({ assignmentId: undefined, start_time: '08:00' })),
    ).toBe(true)
  })
})

describe('eventResponderRemoveConfirm', () => {
  it('names the responder', () => {
    expect(eventResponderRemoveConfirm('דנה')).toBe('האם אתה בטוח שברצונך להסיר את דנה?')
    expect(eventResponderRemoveConfirm('  ')).toBe('האם אתה בטוח שברצונך להסיר את מתנדב?')
  })
})

describe('assigned responder removal availability', () => {
  it('keeps removal wired in the shared standalone and cockpit event form', () => {
    const page = readFileSync(resolve(srcDir, '../pages/EventFormPage.tsx'), 'utf8')
    expect(page).toContain("variant?: 'page' | 'cockpit'")
    expect(page.match(/onClick=\{\(\) => requestRemove\(responder\)\}/g)).toHaveLength(2)
  })

  it('deletes removed assignments under the shift-lead write policy', () => {
    const form = readFileSync(resolve(srcDir, './eventForm.ts'), 'utf8')
    const schema = readFileSync(
      resolve(srcDir, '../../supabase/migrations/20260809120000_init.sql'),
      'utf8',
    )
    expect(form).toContain(
      "supabase.from('event_responders').delete().in('id', removedIds)",
    )
    expect(schema).toMatch(
      /create policy event_responders_lead_admin_write[\s\S]*has_role\(auth\.uid\(\), 'shift_lead'\)/,
    )
  })
})
