import { supabase } from './supabase'

export type PartnerGrant = {
  id: string
  name: string
  telegram_bot_username: string
  expires_at: string
  created_at: string
}

export type PartnerClient = {
  id: string
  name: string
  client_id: string
  telegram_bot_username: string
  is_active: boolean
  created_at: string
}

export type PartnerClientInfo = {
  name: string
  telegram_bot_username: string
  redirect_uri: string
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

async function invokePartnerAuth<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('partner-auth', { body })
  const payload = await readFunctionPayload<T & { error?: string }>(data, error)
  if (payload && !payload.error) {
    return { ok: true, data: payload }
  }
  return {
    ok: false,
    error: payload?.error ?? 'הפעולה נכשלה. בדקו את החיבור ונסו שוב.',
  }
}

export async function fetchPartnerClientInfo(
  clientId: string,
): Promise<{ ok: true; info: PartnerClientInfo } | { ok: false; error: string }> {
  const result = await invokePartnerAuth<PartnerClientInfo>({
    action: 'client_info',
    client_id: clientId,
  })
  if (!result.ok) return result
  if (!result.data.name) return { ok: false, error: 'היישום אינו מוכר או אינו פעיל.' }
  return { ok: true, info: result.data }
}

export async function approvePartnerAuthorize(input: {
  clientId: string
  state: string
  redirectUri?: string | null
}): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    action: 'authorize',
    client_id: input.clientId,
    state: input.state,
  }
  const redirectUri = input.redirectUri?.trim()
  if (redirectUri) body.redirect_uri = redirectUri
  const result = await invokePartnerAuth<{ redirect?: string }>(body)
  if (!result.ok) return result
  const redirect = result.data.redirect?.trim()
  if (!redirect) return { ok: false, error: 'לא ניתן להנפיק קוד אישור. נסו שוב.' }
  return { ok: true, redirect }
}

export async function fetchPartnerGrants(): Promise<
  { ok: true; grants: PartnerGrant[] } | { ok: false; error: string }
> {
  const result = await invokePartnerAuth<{ grants?: PartnerGrant[] }>({
    action: 'list_grants',
  })
  if (!result.ok) return result
  return { ok: true, grants: result.data.grants ?? [] }
}

export async function revokePartnerGrant(
  grantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokePartnerAuth<{ ok?: boolean }>({
    action: 'revoke_grant',
    grant_id: grantId,
  })
  if (!result.ok) return result
  return { ok: true }
}

export async function fetchPartnerClients(): Promise<
  { ok: true; clients: PartnerClient[] } | { ok: false; error: string }
> {
  const result = await invokePartnerAuth<{ clients?: PartnerClient[] }>({
    action: 'admin_list_clients',
  })
  if (!result.ok) return result
  return { ok: true, clients: result.data.clients ?? [] }
}

export async function createPartnerClient(input: {
  name: string
  telegramBotUsername: string
}): Promise<
  | { ok: true; clientId: string; clientSecret: string; authorizeUrl: string }
  | { ok: false; error: string }
> {
  const result = await invokePartnerAuth<{
    client_id?: string
    client_secret?: string
    authorize_url?: string
  }>({
    action: 'admin_create_client',
    name: input.name,
    telegram_bot_username: input.telegramBotUsername,
  })
  if (!result.ok) return result
  const clientId = result.data.client_id?.trim()
  const clientSecret = result.data.client_secret?.trim()
  const authorizeUrl = result.data.authorize_url?.trim()
  if (!clientId || !clientSecret || !authorizeUrl) {
    return { ok: false, error: 'לא ניתן ליצור יישום.' }
  }
  return { ok: true, clientId, clientSecret, authorizeUrl }
}

export async function rotatePartnerClientSecret(
  clientId: string,
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const result = await invokePartnerAuth<{ client_secret?: string }>({
    action: 'admin_rotate_secret',
    client_id: clientId,
  })
  if (!result.ok) return result
  const clientSecret = result.data.client_secret?.trim()
  if (!clientSecret) return { ok: false, error: 'לא ניתן לחדש את הטוקן.' }
  return { ok: true, clientSecret }
}

export async function deletePartnerClient(
  clientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokePartnerAuth<{ ok?: boolean }>({
    action: 'admin_delete_client',
    client_id: clientId,
  })
  if (!result.ok) return result
  return { ok: true }
}
