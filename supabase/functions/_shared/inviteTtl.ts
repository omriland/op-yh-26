/**
 * Durable invite URL lifetime. Resend mints a fresh token; copy-link reuses
 * the current one while it is valid (see reusableInviteToken).
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + INVITE_TTL_MS).toISOString();
}

export function isInviteExpired(
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return true;
  return expiresMs < nowMs;
}

/**
 * Copy-link must not invalidate the link the member already has (the email or
 * an earlier copy): hand back the current token while it is valid. Null means
 * mint a new one.
 */
export function reusableInviteToken(
  invite: { token: string | null | undefined; expiresAt: string | null | undefined },
  nowMs = Date.now(),
): string | null {
  const token = invite.token?.trim();
  if (!token) return null;
  return isInviteExpired(invite.expiresAt, nowMs) ? null : token;
}
