export type ApnsTokenRow = {
  user_id: string;
  token: string;
  environment: "sandbox" | "production";
};

export type PushAttempt = {
  userId: string;
  ok: boolean;
  invalidate?: boolean;
  token?: string;
};

export function summarizePushAttempts(attempts: PushAttempt[]): {
  pushCount: number;
  pushFailedCount: number;
  tokensToDelete: string[];
} {
  const oksByUser = new Map<string, boolean[]>();
  const tokensToDelete: string[] = [];
  for (const attempt of attempts) {
    const list = oksByUser.get(attempt.userId) ?? [];
    list.push(attempt.ok);
    oksByUser.set(attempt.userId, list);
    if (attempt.invalidate && attempt.token) tokensToDelete.push(attempt.token);
  }
  let pushFailedCount = 0;
  for (const oks of oksByUser.values()) {
    if (oks.every((ok) => !ok)) pushFailedCount += 1;
  }
  return {
    pushCount: oksByUser.size,
    pushFailedCount,
    tokensToDelete,
  };
}

export function broadcastPushTitle(channel: "email" | "sms" | "both", subject: string): string {
  if (channel === "sms") return "אבן דרך";
  const trimmed = subject.trim();
  return trimmed || "אבן דרך";
}

export function apnsSecretsPresent(): boolean {
  return Boolean(
    Deno.env.get("APNS_KEY_P8")?.trim() &&
      Deno.env.get("APNS_KEY_ID")?.trim() &&
      Deno.env.get("APNS_TEAM_ID")?.trim() &&
      Deno.env.get("APNS_BUNDLE_ID")?.trim(),
  );
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let cachedJwt: { token: string; exp: number } | null = null;

async function apnsJwt(): Promise<string | null> {
  const pem = Deno.env.get("APNS_KEY_P8")?.trim();
  const kid = Deno.env.get("APNS_KEY_ID")?.trim();
  const teamId = Deno.env.get("APNS_TEAM_ID")?.trim();
  if (!pem || !kid || !teamId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iss: teamId, iat: now })));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  const token = `${signingInput}.${base64Url(signature)}`;
  cachedJwt = { token, exp: now + 50 * 60 };
  return token;
}

function shouldInvalidateToken(status: number, reason: string): boolean {
  return (
    status === 410 ||
    reason === "BadDeviceToken" ||
    reason === "Unregistered" ||
    reason === "ExpiredToken" ||
    reason === "DeviceTokenNotForTopic"
  );
}

export async function sendApnsAlert(input: {
  token: string;
  environment: "sandbox" | "production";
  title: string;
  body: string;
}): Promise<{ ok: boolean; invalidate: boolean }> {
  const jwt = await apnsJwt();
  const topic = Deno.env.get("APNS_BUNDLE_ID")?.trim();
  if (!jwt || !topic) return { ok: false, invalidate: false };

  const host =
    input.environment === "sandbox"
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";

  try {
    const response = await fetch(`https://${host}/3/device/${input.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title: input.title, body: input.body },
          sound: "default",
        },
      }),
    });
    if (response.ok) return { ok: true, invalidate: false };
    let reason = "";
    try {
      const payload = (await response.json()) as { reason?: string };
      reason = payload.reason ?? "";
    } catch {
      /* ignore */
    }
    console.error("apns: send failed", response.status, reason);
    return { ok: false, invalidate: shouldInvalidateToken(response.status, reason) };
  } catch (err) {
    console.error("apns: send exception", err);
    return { ok: false, invalidate: false };
  }
}
