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
