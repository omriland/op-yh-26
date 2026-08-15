/** Wait long enough for a slow Soprano SMS (up to ~90s) before rotating the code. */
export const OTP_START_COOLDOWN_MS = 100_000
export const OTP_START_COOLDOWN_SEC = OTP_START_COOLDOWN_MS / 1000

/** True when a recent challenge should be kept (no second SMS / code rotate). */
export function shouldReuseOtpChallenge(
  createdAtIso: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const createdMs = Date.parse(createdAtIso)
  if (!Number.isFinite(createdMs)) return false
  return nowMs - createdMs < cooldownMs
}
