import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc } }))

import {
  MISSING_KM_ALERT_THRESHOLD,
  MISSING_KM_POPUP_DISMISS_KEY,
  canSeeMissingKmAlert,
  fetchEventsMissingLeadKmCount,
  missingKmAlertMessage,
  readMissingKmPopupDismissed,
  shouldShowMissingKmAlert,
  writeMissingKmPopupDismissed,
} from './missingKmAlert'

describe('missingKmAlert', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('requires at least two events', () => {
    expect(MISSING_KM_ALERT_THRESHOLD).toBe(2)
    expect(shouldShowMissingKmAlert(0)).toBe(false)
    expect(shouldShowMissingKmAlert(1)).toBe(false)
    expect(shouldShowMissingKmAlert(2)).toBe(true)
    expect(shouldShowMissingKmAlert(5)).toBe(true)
  })

  it('builds the Hebrew message with the count', () => {
    expect(missingKmAlertMessage(3)).toBe(
      'לתשומת ליבך, לא הזנת ק״מ ב-3 אירועים. יש לעשות זאת בהקדם',
    )
  })

  it('is for shift_lead and admin only', () => {
    expect(canSeeMissingKmAlert(['responder'])).toBe(false)
    expect(canSeeMissingKmAlert(['shift_lead'])).toBe(true)
    expect(canSeeMissingKmAlert(['admin'])).toBe(true)
    expect(canSeeMissingKmAlert(['super_admin'])).toBe(true)
    expect(canSeeMissingKmAlert(['admin', 'shift_lead'])).toBe(true)
  })

  it('counts through the RPC instead of scanning every event the lead ever ran', () => {
    rpc.mockResolvedValue({ data: 4, error: null })
    return fetchEventsMissingLeadKmCount().then((count) => {
      expect(rpc).toHaveBeenCalledWith('count_events_missing_lead_km')
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(count).toBe(4)
    })
  })

  it('stays silent when the count cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    expect(await fetchEventsMissingLeadKmCount()).toBeNull()
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await fetchEventsMissingLeadKmCount()).toBeNull()
  })

  it('scopes the RPC to the event lead, not every visible event', () => {
    const sql = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../supabase/migrations/20260913080000_count_events_missing_lead_km_for_event_lead.sql',
      ),
      'utf8',
    )
    expect(sql).toContain('e.shift_lead_id = auth.uid()')
    expect(sql).toContain('event_secondary_leads')
    expect(sql).toContain('er.total_km is null')
    // A ללא-רכב volunteer must not be counted as a missing KM.
    expect(sql).toContain('not v.archived')
  })

  it('keeps the done-gate trigger in step with the client on ללא-רכב volunteers', () => {
    // Without this the client derives `done` and the DB trigger rejects the
    // save, turning a stuck event into a failing one.
    const sql = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../supabase/migrations/20260913090000_lead_km_not_required_without_vehicle.sql',
      ),
      'utf8',
    )
    expect(sql).toContain('function public.event_missing_lead_km')
    expect(sql).toContain('not v.archived')
    // Both the derivation and the guard must use the same predicate.
    expect(sql).toContain('not public.event_missing_lead_km(p_event_id)')
    expect(sql).toContain('if public.event_missing_lead_km(new.id) then')
  })

  it('persists popup dismiss in sessionStorage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }
    expect(readMissingKmPopupDismissed(storage)).toBe(false)
    writeMissingKmPopupDismissed(storage)
    expect(store.get(MISSING_KM_POPUP_DISMISS_KEY)).toBe('1')
    expect(readMissingKmPopupDismissed(storage)).toBe(true)
  })
})
