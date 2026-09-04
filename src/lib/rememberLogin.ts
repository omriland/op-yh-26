/**
 * Login "זכור אותי" preference.
 *
 * We never store the password. Checked = keep the Auth session in localStorage
 * for 30 days from that login and prefill the email next time. Unchecked =
 * sessionStorage only (closing the browser signs out) and forget the email.
 * The browser password manager may still save the password via autocomplete.
 */

export const REMEMBER_LOGIN_STORAGE_KEY = 'yahpaz:remember_login'
export const REMEMBER_LOGIN_TTL_DAYS = 30
export const REMEMBER_LOGIN_TTL_MS = REMEMBER_LOGIN_TTL_DAYS * 24 * 60 * 60 * 1000

export type RememberLoginRecord = {
  remember: boolean
  email: string | null
  until: number | null
}

export type RememberLoginView = {
  remember: boolean
  email: string | null
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function defaultRememberLoginStorage(): StorageLike | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null
    return globalThis.localStorage
  } catch {
    return null
  }
}

function parseRecord(raw: string | null): RememberLoginRecord | null {
  if (raw == null || raw.trim() === '') return null
  try {
    const parsed = JSON.parse(raw) as Partial<RememberLoginRecord>
    if (typeof parsed !== 'object' || parsed == null) return null
    return {
      remember: parsed.remember === true,
      email: typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim() : null,
      until: typeof parsed.until === 'number' && Number.isFinite(parsed.until) ? parsed.until : null,
    }
  } catch {
    return null
  }
}

export function readRememberLoginRecord(
  storage: StorageLike | null = defaultRememberLoginStorage(),
): RememberLoginRecord | null {
  if (!storage) return null
  return parseRecord(storage.getItem(REMEMBER_LOGIN_STORAGE_KEY))
}

/** Default is on — same as today's localStorage session — until the user opts out. */
export function isRememberLoginEnabled(
  storage: StorageLike | null = defaultRememberLoginStorage(),
): boolean {
  const record = readRememberLoginRecord(storage)
  if (!record) return true
  return record.remember
}

export function readRememberLogin(
  storage: StorageLike | null = defaultRememberLoginStorage(),
): RememberLoginView {
  const record = readRememberLoginRecord(storage)
  if (!record) return { remember: true, email: null }
  return {
    remember: record.remember,
    email: record.remember ? record.email : null,
  }
}

export function writeRememberLogin(
  input: { remember: boolean; email: string },
  storage: StorageLike | null = defaultRememberLoginStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return
  if (!input.remember) {
    storage.setItem(
      REMEMBER_LOGIN_STORAGE_KEY,
      JSON.stringify({ remember: false, email: null, until: null } satisfies RememberLoginRecord),
    )
    return
  }
  const email = input.email.trim()
  const record: RememberLoginRecord = {
    remember: true,
    email: email || null,
    until: now + REMEMBER_LOGIN_TTL_MS,
  }
  storage.setItem(REMEMBER_LOGIN_STORAGE_KEY, JSON.stringify(record))
}

export function isRememberSessionExpired(
  storage: StorageLike | null = defaultRememberLoginStorage(),
  now: number = Date.now(),
): boolean {
  const record = readRememberLoginRecord(storage)
  if (!record?.remember || record.until == null) return false
  return now >= record.until
}

/** Stamp a 30-day cap on an already-open remembered session that has no until. */
export function ensureRememberSessionUntil(
  storage: StorageLike | null = defaultRememberLoginStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return
  const record = readRememberLoginRecord(storage)
  if (record && (!record.remember || record.until != null)) return
  const next: RememberLoginRecord = {
    remember: true,
    email: record?.email ?? null,
    until: now + REMEMBER_LOGIN_TTL_MS,
  }
  storage.setItem(REMEMBER_LOGIN_STORAGE_KEY, JSON.stringify(next))
}

type PasswordCredentialLike = {
  id: string
  password?: string
  type: string
}

type PasswordCredentialCtor = new (data: { id: string; password: string; name?: string }) => {
  id: string
  password: string
}

function passwordCredentialCtor(): PasswordCredentialCtor | null {
  const ctor = (globalThis as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential
  return ctor ?? null
}

export async function storeBrowserPassword(email: string, password: string): Promise<void> {
  const trimmed = email.trim()
  if (!trimmed || !password) return
  if (typeof navigator === 'undefined' || !navigator.credentials?.store) return
  const Ctor = passwordCredentialCtor()
  if (!Ctor) return
  try {
    const cred = new Ctor({ id: trimmed, password, name: trimmed })
    await navigator.credentials.store(cred as unknown as Credential)
  } catch {
    /* unsupported, declined, or insecure context */
  }
}

export async function readBrowserPassword(): Promise<{ email: string; password: string } | null> {
  if (typeof navigator === 'undefined' || !navigator.credentials?.get) return null
  try {
    const cred = (await navigator.credentials.get({
      password: true,
      mediation: 'optional',
    } as CredentialRequestOptions)) as PasswordCredentialLike | null
    if (!cred || cred.type !== 'password' || !cred.id || !cred.password) return null
    return { email: cred.id, password: cred.password }
  } catch {
    return null
  }
}
