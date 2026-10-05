/** Email fill-link lifetime. Volunteers may complete a report weeks after the event. */
export const FILL_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const FILL_TOKEN_PURPOSE = "yahpaz-fill-v1";

export function fillTokenExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + FILL_TOKEN_TTL_MS).toISOString();
}

export function isFillTokenExpired(
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return true;
  return expiresMs <= nowMs;
}

/**
 * Same assignment + secret always yields the same raw token, so reminder
 * emails can repeat the original link without invalidating it.
 */
export async function deterministicFillToken(
  assignmentId: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${FILL_TOKEN_PURPOSE}:${assignmentId}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type FillTokenMintDecision = "reuse" | "keep-legacy" | "mint";

/**
 * Never replace a still-valid token. That lets the same email link work
 * on a phone and later on another device. `replaceLegacy` is only for the
 * first fill-ready send, when no email has used the old random hash yet.
 */
export function fillTokenMintDecision(input: {
  storedHash: string | null | undefined;
  expiresAt: string | null | undefined;
  deterministicHash: string;
  nowMs?: number;
  replaceLegacy?: boolean;
}): FillTokenMintDecision {
  const expired = isFillTokenExpired(input.expiresAt, input.nowMs);
  if (!input.storedHash || expired) return "mint";
  if (input.storedHash === input.deterministicHash) return "reuse";
  return input.replaceLegacy ? "mint" : "keep-legacy";
}
