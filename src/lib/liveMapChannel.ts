import type { LiveMapPin } from './liveMapPins'
import { padBbox, pointInBbox, type LatLngBbox } from './mapCatalogView'

export const LIVE_MOTION_MS = 1_000

export type LiveTableChange = {
  eventType: string
  new: Record<string, unknown>
  old: Record<string, unknown>
}

export type LiveDelta =
  | { type: 'upsert'; assignmentId: string; lat: number; lng: number; recordedAt: string }
  | { type: 'remove'; assignmentId: string }

export type LiveMotion = {
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  startMs: number
  durationMs: number
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asTime(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function liveDeltaFromChange(change: LiveTableChange): LiveDelta | null {
  if (change.eventType === 'DELETE') {
    const assignmentId = asId(change.old.event_responder_id)
    return assignmentId ? { type: 'remove', assignmentId } : null
  }
  const assignmentId = asId(change.new.event_responder_id)
  const lat = asNum(change.new.lat)
  const lng = asNum(change.new.lng)
  const recordedAt = asTime(change.new.recorded_at)
  if (!assignmentId || lat == null || lng == null || !recordedAt) return null
  return { type: 'upsert', assignmentId, lat, lng, recordedAt }
}

export function applyLiveDelta(
  pins: readonly LiveMapPin[],
  delta: LiveDelta,
): { pins: LiveMapPin[]; needsSnapshot: boolean } {
  if (delta.type === 'remove') {
    return {
      pins: pins.filter((pin) => pin.assignmentId !== delta.assignmentId),
      needsSnapshot: false,
    }
  }
  const index = pins.findIndex((pin) => pin.assignmentId === delta.assignmentId)
  if (index < 0) {
    return { pins: [...pins], needsSnapshot: true }
  }
  const next = [...pins]
  const current = next[index]!
  next[index] = {
    ...current,
    lat: delta.lat,
    lng: delta.lng,
    recordedAt: delta.recordedAt,
  }
  return { pins: next, needsSnapshot: false }
}

export function cullLivePinsToBbox(
  pins: readonly LiveMapPin[],
  bbox: LatLngBbox,
): LiveMapPin[] {
  const padded = padBbox(bbox)
  return pins.filter((pin) => pointInBbox(pin.lat, pin.lng, padded))
}

export function pushLiveMotion(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  startMs: number,
  durationMs = LIVE_MOTION_MS,
): LiveMotion {
  return { from, to, startMs, durationMs }
}

export function liveMotionPosition(
  motion: LiveMotion,
  nowMs: number,
): { lat: number; lng: number } {
  const span = motion.durationMs || 1
  const t = Math.min(1, Math.max(0, (nowMs - motion.startMs) / span))
  return {
    lat: motion.from.lat + (motion.to.lat - motion.from.lat) * t,
    lng: motion.from.lng + (motion.to.lng - motion.from.lng) * t,
  }
}
