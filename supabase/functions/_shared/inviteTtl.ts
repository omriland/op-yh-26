/** Durable invite URL lifetime. Resend / copy-link mints a fresh token. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

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
