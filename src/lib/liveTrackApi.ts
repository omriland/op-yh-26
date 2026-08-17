import { isImpersonating } from './impersonationStash'
import { supabase } from './supabase'

export type TrackCallResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string; code?: 'invalid' | 'expired' | 'ended' }

async function readFunctionPayload<T>(
  data: unknown,
  error: { context?: Response; message?: string } | null,
): Promise<T | null> {
  if (data && typeof data === 'object') return data as T
  const ctx = error?.context
  if (ctx) {
    try {
      return (await ctx.json()) as T
    } catch {
      return null
    }
  }
  return null
}

function invokeHeaders(): Record<string, string> | undefined {
  if (!isImpersonating()) return undefined
  return { 'x-yahpaz-impersonating': '1' }
}

export async function startResponderTracking(eventResponderIds: string[]): Promise<TrackCallResult> {
  const ids = [...new Set(eventResponderIds.filter(Boolean))]
  if (ids.length === 0) return { ok: true, skipped: true }
  const { data, error } = await supabase.functions.invoke('responder-track', {
    headers: invokeHeaders(),
    body: { action: 'start', event_responder_ids: ids },
  })
  const body = await readFunctionPayload<{ ok?: boolean; error?: string; failed?: boolean }>(
    data,
    error,
  )
  if (body?.ok && !body.failed) return { ok: true }
  if (body?.ok && body.failed) {
    return { ok: false, error: 'שליחת מעקב המיקום נכשלה. האירוע נשמר.' }
  }
  return { ok: false, error: body?.error ?? 'שליחת מעקב המיקום נכשלה. האירוע נשמר.' }
}

export async function stopResponderTracking(eventResponderIds: string[]): Promise<TrackCallResult> {
  const ids = [...new Set(eventResponderIds.filter(Boolean))]
  if (ids.length === 0) return { ok: true, skipped: true }
  const { data, error } = await supabase.functions.invoke('responder-track', {
    headers: invokeHeaders(),
    body: { action: 'stop', event_responder_ids: ids },
  })
  const body = await readFunctionPayload<{ ok?: boolean; error?: string }>(data, error)
  if (body?.ok) return { ok: true }
  return { ok: false, error: body?.error ?? 'עצירת מעקב המיקום נכשלה. האירוע נשמר.' }
}

export async function loadTrackByToken(trackToken: string): Promise<TrackCallResult> {
  const { data, error } = await supabase.functions.invoke('responder-track', {
    body: { action: 'load', track_token: trackToken },
  })
  const body = await readFunctionPayload<{ ok?: boolean; error?: string; code?: string }>(
    data,
    error,
  )
  if (body?.ok) return { ok: true }
  const code =
    body?.code === 'expired' || body?.code === 'ended' || body?.code === 'invalid'
      ? body.code
      : 'invalid'
  return {
    ok: false,
    error: body?.error ?? 'קישור המעקב אינו תקין או שפג תוקפו.',
    code,
  }
}

export async function pingTrackLocation(input: {
  trackToken: string
  lat: number
  lng: number
  accuracyM?: number | null
  recordedAt: string
}): Promise<TrackCallResult> {
  const { data, error } = await supabase.functions.invoke('responder-track', {
    body: {
      action: 'ping',
      track_token: input.trackToken,
      lat: input.lat,
      lng: input.lng,
      accuracy_m: input.accuracyM ?? null,
      recorded_at: input.recordedAt,
    },
  })
  const body = await readFunctionPayload<{ ok?: boolean; error?: string; code?: string }>(
    data,
    error,
  )
  if (body?.ok) return { ok: true }
  const code =
    body?.code === 'expired' || body?.code === 'ended' || body?.code === 'invalid'
      ? body.code
      : 'invalid'
  return {
    ok: false,
    error: body?.error ?? 'שמירת המיקום נכשלה.',
    code,
  }
}
