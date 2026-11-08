import { validateSmartSearchFilter } from './smartSearchFilter.ts'
import type { SmartSearchFilter, SmartSearchVocab } from './smartSearchFilter.ts'

/** Claude Haiku 5.5: the parser only turns a sentence into a short JSON filter. */
export const SMART_SEARCH_MODEL = 'claude-haiku-5-5'
export const SMART_SEARCH_MAX_TOKENS = 400

/**
 * Messages API params for one parse. Thinking off (accepted on Haiku 5.5 at effort
 * low to high) and effort low: the job is extraction. No temperature, which Haiku
 * 5.5 rejects; the schema and validateSmartSearchFilter keep the output in bounds.
 * No cache_control: at these volumes the 5-minute cache would mostly miss.
 */
export function claudeRequestBody(
  prompt: { system: string; user: string },
  schema: Record<string, unknown>,
) {
  return {
    model: SMART_SEARCH_MODEL,
    max_tokens: SMART_SEARCH_MAX_TOKENS,
    thinking: { type: 'disabled' as const },
    output_config: {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema },
    },
    system: prompt.system,
    messages: [{ role: 'user' as const, content: prompt.user }],
  }
}

export type ParseFailure = 'refusal' | 'invalid_output'

/** The fields of a Messages API response this reads; the SDK's Message satisfies it. */
type ClaudeReply = {
  stop_reason?: string | null
  content?: readonly { type: string; text?: string }[]
}

/**
 * A refusal (Haiku 5.5 has no server-side fallback), a cut-off answer, no text or
 * text that is not JSON all fail; the caller falls back to the words as text.
 */
export function parseClaudeFilter(
  reply: ClaudeReply | null | undefined,
  vocab: SmartSearchVocab,
): { filter: SmartSearchFilter } | { error: ParseFailure } {
  if (reply?.stop_reason === 'refusal') return { error: 'refusal' }
  if (!reply || reply.stop_reason === 'max_tokens') return { error: 'invalid_output' }
  const text = (reply.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
  if (!text) return { error: 'invalid_output' }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    // The model never sets these; drop them if it tries.
    delete raw.person_ids
    delete raw.person_callsigns
    return { filter: validateSmartSearchFilter(raw, vocab) }
  } catch {
    return { error: 'invalid_output' }
  }
}
