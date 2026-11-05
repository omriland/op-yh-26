/**
 * Reads licence plates off one event photo. Shared by Edge `plate-scan` and its tests.
 * The model only suggests: the responder confirms every plate before it is added.
 */

export const PLATE_SCAN_MIN_DIGITS = 5
export const PLATE_SCAN_MAX_DIGITS = 8
/** More than this in one photo is a car park, not the treated vehicles. */
export const PLATE_SCAN_MAX_PLATES = 6
export const PLATE_SCAN_DEFAULT_MODEL = 'gpt-4.1-mini'

const PLATE_SCAN_PROMPT = [
  'This photo was taken by a road-rescue volunteer at an incident in Israel.',
  'List every vehicle licence plate number you can read with confidence.',
  'Israeli plates are usually yellow with 7 or 8 digits (older ones have 5 or 6).',
  'Return digits only, no dashes or letters. Skip a plate if any digit is unclear.',
  'Return an empty list when no plate is readable.',
].join(' ')

export const plateScanJsonSchema = {
  name: 'plate_scan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['plates'],
    properties: {
      plates: { type: 'array', items: { type: 'string' } },
    },
  },
}

export function plateScanRequestBody(model: string, imageDataUrl: string): Record<string, unknown> {
  return {
    model,
    temperature: 0,
    max_completion_tokens: 200,
    response_format: { type: 'json_schema', json_schema: plateScanJsonSchema },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PLATE_SCAN_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
  }
}

/** Keeps 5–8 digit plates, digits only, unique, in reading order. */
export function cleanScannedPlates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const digits = value.replace(/\D/g, '')
    if (digits.length < PLATE_SCAN_MIN_DIGITS || digits.length > PLATE_SCAN_MAX_DIGITS) continue
    if (out.includes(digits)) continue
    out.push(digits)
  }
  return out.slice(0, PLATE_SCAN_MAX_PLATES)
}

/** Empty when the model refused, returned nothing, or returned something that is not JSON. */
export function parsePlateScanResponse(responseJson: unknown): string[] {
  const choices = (responseJson as { choices?: { message?: { content?: unknown } }[] } | null)
    ?.choices
  const content = choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content) return []
  try {
    const parsed = JSON.parse(content) as { plates?: unknown }
    return cleanScannedPlates(parsed?.plates)
  } catch {
    return []
  }
}

/** Base64 for a data URL without blowing the call stack on large photos. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}
