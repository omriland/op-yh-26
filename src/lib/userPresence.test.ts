import { describe, expect, it, vi } from 'vitest'
import {
  PRESENCE_NOW_MS,
  PRESENCE_RECENT_MS,
  PRESENCE_TOUCH_THROTTLE_MS,
  createPresenceHeartbeat,
  mergeLastActive,
  presenceFromLastActive,
  shouldTouchPresence,
} from './userPresence'

const NOW = Date.parse('2026-08-15T13:00:00.000Z')
const active = { active: true, invite_pending: false }

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString()
}

describe('presenceFromLastActive', () => {
  it('is now at 0s, 2m59s, and exactly 3 minutes', () => {
    expect(presenceFromLastActive(iso(0), NOW, active)).toBe('now')
    expect(presenceFromLastActive(iso(PRESENCE_NOW_MS - 1000), NOW, active)).toBe('now')
    expect(presenceFromLastActive(iso(PRESENCE_NOW_MS), NOW, active)).toBe('now')
  })

  it('is recent just after 3 minutes through exactly 15 minutes', () => {
    expect(presenceFromLastActive(iso(PRESENCE_NOW_MS + 1000), NOW, active)).toBe('recent')
    expect(presenceFromLastActive(iso(PRESENCE_RECENT_MS - 1000), NOW, active)).toBe('recent')
    expect(presenceFromLastActive(iso(PRESENCE_RECENT_MS), NOW, active)).toBe('recent')
  })

  it('is null after 15 minutes', () => {
    expect(presenceFromLastActive(iso(PRESENCE_RECENT_MS + 1000), NOW, active)).toBeNull()
  })

  it('is null when timestamp is missing or unparsable', () => {
    expect(presenceFromLastActive(null, NOW, active)).toBeNull()
    expect(presenceFromLastActive(undefined, NOW, active)).toBeNull()
    expect(presenceFromLastActive('not-a-date', NOW, active)).toBeNull()
  })

  it('treats a future timestamp as now', () => {
    expect(presenceFromLastActive(iso(-60_000), NOW, active)).toBe('now')
  })

  it('hides pending invitees and inactive users even when fresh', () => {
    expect(
      presenceFromLastActive(iso(0), NOW, { active: true, invite_pending: true }),
    ).toBeNull()
    expect(
      presenceFromLastActive(iso(0), NOW, { active: false, invite_pending: false }),
    ).toBeNull()
  })
})

describe('mergeLastActive', () => {
  const rows = [
    { id: 'a', name: 'א' },
    { id: 'b', name: 'ב' },
    { id: 'c', name: 'ג' },
  ]

  it('copies matching timestamps and nulls missing ids', () => {
    const merged = mergeLastActive(rows, [
      { user_id: 'b', last_active_at: '2026-08-15T12:00:00.000Z' },
      { user_id: 'orphan', last_active_at: '2026-08-15T12:30:00.000Z' },
    ])
    expect(merged.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(merged.map((row) => row.last_active_at)).toEqual([
      null,
      '2026-08-15T12:00:00.000Z',
      null,
    ])
    expect(merged[0]?.name).toBe('א')
  })
})

describe('shouldTouchPresence', () => {
  const ready = {
    impersonating: false,
    hidden: false,
    nowMs: NOW,
    lastTouchAtMs: null as number | null,
    inFlight: false,
  }

  it('touches when visible, not impersonating, and not throttled', () => {
    expect(shouldTouchPresence(ready)).toBe('touch')
  })

  it('skips impersonating, hidden, in-flight, and inside the throttle window', () => {
    expect(shouldTouchPresence({ ...ready, impersonating: true })).toBe('skip')
    expect(shouldTouchPresence({ ...ready, hidden: true })).toBe('skip')
    expect(shouldTouchPresence({ ...ready, inFlight: true })).toBe('skip')
    expect(
      shouldTouchPresence({
        ...ready,
        lastTouchAtMs: NOW - (PRESENCE_TOUCH_THROTTLE_MS - 1),
      }),
    ).toBe('skip')
  })

  it('touches again once the throttle has elapsed', () => {
    expect(
      shouldTouchPresence({
        ...ready,
        lastTouchAtMs: NOW - PRESENCE_TOUCH_THROTTLE_MS,
      }),
    ).toBe('touch')
  })
})

describe('createPresenceHeartbeat', () => {
  it('touches on pointerdown and skips a second action inside 60s', async () => {
    const listeners = new Map<string, EventListener>()
    const touch = vi.fn().mockResolvedValue(undefined)
    let now = NOW
    const heartbeat = createPresenceHeartbeat({
      isImpersonating: () => false,
      isDocumentHidden: () => false,
      now: () => now,
      touch,
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type) => {
        listeners.delete(type)
      },
      throttleMs: PRESENCE_TOUCH_THROTTLE_MS,
    })

    listeners.get('pointerdown')?.(new Event('pointerdown'))
    await vi.waitFor(() => expect(touch).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    await Promise.resolve()

    listeners.get('pointerdown')?.(new Event('pointerdown'))
    await Promise.resolve()
    expect(touch).toHaveBeenCalledTimes(1)

    now = NOW + PRESENCE_TOUCH_THROTTLE_MS
    listeners.get('pointerdown')?.(new Event('pointerdown'))
    await vi.waitFor(() => expect(touch).toHaveBeenCalledTimes(2))

    heartbeat.stop()
    expect(listeners.size).toBe(0)
  })

  it('touches when the tab becomes visible', async () => {
    const listeners = new Map<string, EventListener>()
    const touch = vi.fn().mockResolvedValue(undefined)
    let hidden = true
    createPresenceHeartbeat({
      isImpersonating: () => false,
      isDocumentHidden: () => hidden,
      now: () => NOW,
      touch,
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type) => {
        listeners.delete(type)
      },
    })

    hidden = false
    listeners.get('visibilitychange')?.(new Event('visibilitychange'))
    await vi.waitFor(() => expect(touch).toHaveBeenCalledTimes(1))
  })

  it('does not throw when touch rejects', async () => {
    const listeners = new Map<string, EventListener>()
    const touch = vi.fn().mockRejectedValue(new Error('offline'))
    createPresenceHeartbeat({
      isImpersonating: () => false,
      isDocumentHidden: () => false,
      now: () => NOW,
      touch,
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type) => {
        listeners.delete(type)
      },
    })

    expect(() => listeners.get('keydown')?.(new Event('keydown'))).not.toThrow()
    await Promise.resolve()
    expect(touch).toHaveBeenCalledTimes(1)
  })
})
