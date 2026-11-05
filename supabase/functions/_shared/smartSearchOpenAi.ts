import { validateSmartSearchFilter } from './smartSearchFilter.ts'
import type { SmartSearchFilter, SmartSearchVocab } from './smartSearchFilter.ts'

export function openAiRequestBody(
  model: string,
  messages: { role: string; content: string }[],
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return {
    model,
    messages,
    temperature: 0,
    max_completion_tokens: 300,
    response_format: { type: 'json_schema', json_schema: schema },
  }
}

/** Null when the model refused, returned nothing, or returned something that is not JSON. */
export function parseOpenAiFilter(responseJson: unknown, vocab: SmartSearchVocab): SmartSearchFilter | null {
  const choices = (responseJson as { choices?: { message?: { content?: unknown } }[] } | null)?.choices
  const content = choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content) return null
  try {
    return validateSmartSearchFilter(JSON.parse(content), vocab)
  } catch {
    return null
  }
}
