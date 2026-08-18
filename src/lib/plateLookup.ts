import { supabase } from './supabase'

export const PLATE_LOOKUP_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3'

export type PlateLookupHit = {
  model: string | null
  color: string | null
  manufacturer: string | null
}

export function plateLookupMispar(plate: string): number {
  return Number(String(plate).replace(/\D/g, ''))
}

/** Upstream data.gov.il URL (used by Edge `plate-lookup`; browsers must not call this). */
export function plateLookupUrl(plate: string): string {
  const params = new URLSearchParams({
    resource_id: PLATE_LOOKUP_RESOURCE_ID,
    filters: JSON.stringify({ mispar_rechev: plateLookupMispar(plate) }),
    fields: 'tzeva_rechev,kinuy_mishari,tozeret_nm',
    limit: '1',
  })
  return `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`
}

export function parsePlateLookupBody(body: string): PlateLookupHit | null {
  if (!body.trimStart().startsWith('{')) return null
  try {
    const parsed = JSON.parse(body) as {
      result?: {
        records?: Array<{
          tzeva_rechev?: unknown
          kinuy_mishari?: unknown
          tozeret_nm?: unknown
        }>
      }
    }
    const row = parsed.result?.records?.[0]
    if (!row) return null
    const model = typeof row.kinuy_mishari === 'string' ? row.kinuy_mishari.trim() : ''
    const color = typeof row.tzeva_rechev === 'string' ? row.tzeva_rechev.trim() : ''
    const manufacturer = typeof row.tozeret_nm === 'string' ? row.tozeret_nm.trim() : ''
    return {
      model: model || null,
      color: color || null,
      manufacturer: manufacturer || null,
    }
  } catch {
    return null
  }
}

/**
 * Look up plate model/color/manufacturer via Edge proxy.
 * Direct browser → data.gov.il fails (no CORS).
 */
export async function lookupPlate(plate: string): Promise<PlateLookupHit | null> {
  try {
    const { data, error } = await supabase.functions.invoke('plate-lookup', {
      body: { plate },
    })
    if (error) return null
    const hit = (data as { hit?: PlateLookupHit | null } | null)?.hit
    if (!hit || typeof hit !== 'object') return null
    return {
      model: hit.model ?? null,
      color: hit.color ?? null,
      manufacturer: hit.manufacturer ?? null,
    }
  } catch {
    return null
  }
}
