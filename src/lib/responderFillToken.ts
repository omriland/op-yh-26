import { supabase } from './supabase'
import { settleTreatedPlatePending } from './treatedPlates'
import type { ResponderFillContext, ResponderFillDraft, ResponderFillErrors } from './responderFill'

export type LoadByTokenResult =
  | { ok: true; context: ResponderFillContext & { responderId?: string } }
  | { ok: false; error: string; code: 'expired' | 'invalid' | 'gone' | 'error'; eventId?: string }

export type SaveByTokenResult =
  | { ok: true; eventStatus: string | null; participationStatus: string }
  | { ok: false; error: string; fieldErrors?: ResponderFillErrors; code?: string; eventId?: string }

export async function loadFillByToken(fillToken: string): Promise<LoadByTokenResult> {
  const { data, error } = await supabase.functions.invoke('responder-fill', {
    body: { action: 'load_by_token', fill_token: fillToken },
  })

  const payload = await readFunctionPayload<{
    context?: ResponderFillContext & { responderId?: string }
    error?: string
    code?: string
    event_id?: string
  }>(data, error)

  if (payload?.context) {
    return { ok: true, context: payload.context }
  }

  const code =
    payload?.code === 'expired' || payload?.code === 'gone' || payload?.code === 'invalid'
      ? payload.code
      : 'invalid'

  return {
    ok: false,
    error: payload?.error ?? 'קישור הדיווח אינו תקין או שפג תוקפו.',
    code,
    eventId: payload?.event_id,
  }
}

export async function saveFillByToken(input: {
  fillToken: string
  mode: 'draft' | 'complete'
  draft: ResponderFillDraft
}): Promise<SaveByTokenResult> {
  let draft = input.draft
  if (input.mode === 'complete') {
    const settled = settleTreatedPlatePending(
      input.draft.treated_plate_pending,
      input.draft.treated_plates,
      'complete',
    )
    if (!settled.ok) {
      return {
        ok: false,
        error: 'יש למלא את כל שדות החובה לפני סיום הדיווח.',
        fieldErrors: { treated_plates: settled.error },
      }
    }
    draft = {
      ...input.draft,
      treated_plates: settled.plates,
      treated_plate_pending: '',
    }
  }
  const { data, error } = await supabase.functions.invoke('responder-fill', {
    body: {
      action: 'save_by_token',
      fill_token: input.fillToken,
      mode: input.mode,
      draft,
    },
  })

  const body = await readFunctionPayload<{
    ok?: boolean
    eventStatus?: string | null
    participationStatus?: string
    error?: string
    fieldErrors?: ResponderFillErrors
    code?: string
    event_id?: string
  }>(data, error)

  if (body?.ok) {
    return {
      ok: true,
      eventStatus: body.eventStatus ?? null,
      participationStatus: body.participationStatus ?? input.mode,
    }
  }

  return {
    ok: false,
    error: body?.error ?? 'שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב.',
    fieldErrors: body?.fieldErrors,
    code: body?.code,
    eventId: body?.event_id,
  }
}

export async function notifyFillReady(input: {
  eventId?: string
  eventResponderIds?: string[]
}): Promise<{ ok: true; sent: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('responder-fill', {
    body: {
      action: 'notify_fill_ready',
      event_id: input.eventId,
      event_responder_ids: input.eventResponderIds,
    },
  })

  const body = await readFunctionPayload<{ sent?: string[]; error?: string }>(data, error)
  if (!body || body.error) {
    return { ok: false, error: body?.error ?? 'שליחת התראת הדיווח נכשלה.' }
  }

  return { ok: true, sent: body.sent ?? [] }
}

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
