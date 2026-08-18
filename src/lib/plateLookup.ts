export const PLATE_LOOKUP_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3'

export function plateLookupMispar(plate: string): number {
  return Number(String(plate).replace(/\D/g, ''))
}

export function plateLookupUrl(plate: string): string {
  const params = new URLSearchParams({
    resource_id: PLATE_LOOKUP_RESOURCE_ID,
    filters: JSON.stringify({ mispar_rechev: plateLookupMispar(plate) }),
    fields: 'tzeva_rechev,kinuy_mishari',
    limit: '1',
  })
  return `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`
}

export function parsePlateLookupBody(
  body: string,
): { model: string | null; color: string | null } | null {
  if (!body.trimStart().startsWith('{')) return null
  try {
    const parsed = JSON.parse(body) as {
      result?: { records?: Array<{ tzeva_rechev?: unknown; kinuy_mishari?: unknown }> }
    }
    const row = parsed.result?.records?.[0]
    if (!row) return null
    const model = typeof row.kinuy_mishari === 'string' ? row.kinuy_mishari.trim() : ''
    const color = typeof row.tzeva_rechev === 'string' ? row.tzeva_rechev.trim() : ''
    return { model: model || null, color: color || null }
  } catch {
    return null
  }
}

export async function lookupPlate(
  plate: string,
): Promise<{ model: string | null; color: string | null } | null> {
  try {
    const res = await fetch(plateLookupUrl(plate))
    const body = await res.text()
    return parsePlateLookupBody(body)
  } catch {
    return null
  }
}
