/** SHA-256 hex + random tokens for partner OAuth (Edge). */

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Telegram start payload: yp_ + 32 charset chars (35 total). */
export function randomStartParam(): string {
  return `yp_${bytesToBase64Url(randomBytes(24))}`;
}

export function randomAccessToken(): string {
  return `ypat_${bytesToBase64Url(randomBytes(32))}`;
}

export function randomClientId(): string {
  return `ypb_${bytesToBase64Url(randomBytes(12))}`;
}

export function randomClientSecret(): string {
  return bytesToBase64Url(randomBytes(32));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const len = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}
