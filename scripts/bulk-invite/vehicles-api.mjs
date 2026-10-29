/**
 * The vehicles step of the bulk invite, over PostgREST as the signed-in admin.
 * It goes through the same RLS as the admin users screen (vehicles_write_admin):
 * plain table inserts, no edge function, so no email, SMS or push. The DB
 * trigger formats the plate (XX-XXX-XX / XXX-XX-XXX); the unique index
 * (user_id, plate_number) is the last guard against a duplicate.
 */
export function postgrestVehicleApi({ url, apiKey, accessToken, fetchImpl = fetch }) {
  const headers = {
    apikey: apiKey,
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  }
  async function call(path, init = {}) {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    return { status: res.status, body }
  }
  const fail = (what, r) => new Error(`${what} נכשל (${r.status}${r.body?.code ? ` ${r.body.code}` : ''})`)
  return {
    async findUserId(email) {
      const r = await call(`profiles?select=id&email=eq.${encodeURIComponent(email)}`)
      if (r.status !== 200) throw fail('חיפוש המשתמש', r)
      return r.body.length === 1 ? r.body[0].id : null
    },
    async listPlates(userId) {
      const r = await call(`vehicles?select=plate_number&user_id=eq.${encodeURIComponent(userId)}`)
      if (r.status !== 200) throw fail('קריאת הרכבים', r)
      return r.body.map((row) => row.plate_number)
    },
    async insert(userId, vehicle) {
      const r = await call('vehicles', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, plate_number: vehicle.plate_number, model: vehicle.model }),
      })
      if (r.status === 201) return 'inserted'
      if (r.status === 409 && r.body?.code === '23505') return 'duplicate'
      throw fail('הוספת רכב', r)
    },
  }
}
