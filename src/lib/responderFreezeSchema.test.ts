import { describe, expect, it, vi, beforeEach } from 'vitest'

const limit = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ limit }) }),
  },
}))

import {
  RESPONDER_FREEZE_FIELDS,
  hasResponderFreezeColumns,
  resetResponderFreezeProbe,
  withResponderFreeze,
} from './responderFreezeSchema'

const SELECT = `
  id,
  responders:event_responders(
    total_km,
    ${RESPONDER_FREEZE_FIELDS}
    profile:profiles(full_name)
  )
`

describe('withResponderFreeze', () => {
  beforeEach(() => {
    resetResponderFreezeProbe()
    limit.mockReset()
  })

  it('asks for the participation columns once the migration has landed', async () => {
    limit.mockResolvedValue({ data: [], error: null })

    const select = await withResponderFreeze(SELECT)

    expect(select).toContain('frozen_over_60km, frozen_suspicious_duplicate,')
    expect(select).not.toContain(RESPONDER_FREEZE_FIELDS)
  })

  it('drops them, commas and all, while the columns are missing', async () => {
    limit.mockResolvedValue({ data: null, error: { code: '42703' } })

    const select = await withResponderFreeze(SELECT)

    expect(select).not.toContain('frozen_over_60km')
    expect(select).not.toContain(RESPONDER_FREEZE_FIELDS)
    expect(select).not.toMatch(/,\s*,/)
    expect(select.replace(/\s+/g, ' ')).toContain('total_km, profile:profiles(full_name)')
  })

  it('keeps the columns when the probe fails for any other reason', async () => {
    limit.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })

    expect(await hasResponderFreezeColumns()).toBe(true)
  })

  it('probes once per session', async () => {
    limit.mockResolvedValue({ data: [], error: null })

    await Promise.all([withResponderFreeze(SELECT), withResponderFreeze(SELECT)])
    await withResponderFreeze(SELECT)

    expect(limit).toHaveBeenCalledTimes(1)
  })
})
