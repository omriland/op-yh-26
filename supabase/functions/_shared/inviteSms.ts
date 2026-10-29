/**
 * SMS that rides along with the initial-login invite email.
 * One body, no link and no password.
 *
 * Providers (secret INVITE_SMS_PROVIDER, default "soprano"):
 * - "soprano": `SOPRANO_USER` / `SOPRANO_PASSWORD` / `SOPRANO_SOURCE`. Soprano answers
 *   HTTP 200 even when it rejects a message (the result is in the body), so the body
 *   is always logged and an error body counts as failed.
 * - "twilio": the login-OTP Messaging Service (`TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`,
 *   `TWILIO_API_SECRET`, `TWILIO_MESSAGING_SERVICE_SID`). Success = 2xx with a message SID.
 */
export const INVITE_SMS_BODY =
  "הוזמנת למערכת 'אבן דרך'. פרטי התחברות ראשוניים מופיעים בתיבת המייל שלך";

const SOPRANO_API_URL = "https://sec.soprano.co.il/";
const TWILIO_MESSAGES_URL = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

export type SopranoCredentials = {
  user?: string;
  password?: string;
  source?: string;
};

export type TwilioCredentials = {
  accountSid?: string;
  apiKey?: string;
  apiSecret?: string;
  messagingServiceSid?: string;
};

export type InviteSmsEnv = SopranoCredentials & {
  provider?: string;
  twilio?: TwilioCredentials;
};

export type InviteSmsResult = "sent" | "skipped" | "failed";

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

/** Israeli mobile as Soprano expects it (`9725…`), or null when it cannot be sent. */
export function inviteSmsDestination(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = phoneDigits(raw);
  if (digits.length !== 10 || !digits.startsWith("05")) return null;
  return `972${digits.slice(1)}`;
}

/** Log-safe body: no phone numbers, no credentials echoed back, one line, short. */
export function redactProviderBody(text: string): string {
  return text
    .replace(/\d{7,}/g, (d) => `…${d.slice(-3)}`)
    .replace(/(password|user|pass)\s*[=:]\s*[^&\s<"]+/gi, "$1=…")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

/**
 * Soprano's body says whether the message was taken. An empty body or one that
 * reads like an error is a failure even with HTTP 200.
 */
export function sopranoBodyLooksFailed(text: string): boolean {
  const body = text.trim();
  if (!body) return true;
  return /error|fail|invalid|denied|wrong|unauthori|blocked|not allowed|refused|insufficient|שגיא|נכשל|חסום|אין הרשאה/i
    .test(body);
}

async function sendViaSoprano(
  destination: string,
  env: SopranoCredentials,
  fetchImpl: typeof fetch,
): Promise<InviteSmsResult> {
  if (!env.user || !env.password) {
    console.error("admin-users: missing Soprano env");
    return "failed";
  }
  const formData = new URLSearchParams({
    version: "1.0",
    operation: "mt",
    message: INVITE_SMS_BODY,
    user: env.user,
    password: env.password,
    destination,
    source: env.source?.trim() || "YHPZ",
  });
  try {
    const res = await fetchImpl(SOPRANO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const text = await res.text().catch(() => "");
    const failed = !res.ok || sopranoBodyLooksFailed(text);
    const line = `admin-users: Soprano ${failed ? "rejected" : "ok"} ${res.status} ${redactProviderBody(text)}`;
    if (failed) console.error(line);
    else console.log(line);
    return failed ? "failed" : "sent";
  } catch (err) {
    console.error("admin-users: Soprano exception", err);
    return "failed";
  }
}

async function sendViaTwilio(
  destination972: string,
  env: TwilioCredentials | undefined,
  fetchImpl: typeof fetch,
): Promise<InviteSmsResult> {
  if (!env?.accountSid || !env.apiKey || !env.apiSecret || !env.messagingServiceSid) {
    console.error("admin-users: missing Twilio env");
    return "failed";
  }
  const formData = new URLSearchParams({
    To: `+${destination972}`,
    MessagingServiceSid: env.messagingServiceSid,
    Body: INVITE_SMS_BODY,
  });
  try {
    const res = await fetchImpl(TWILIO_MESSAGES_URL(env.accountSid), {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.apiKey}:${env.apiSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
    const text = await res.text().catch(() => "");
    let sid = "";
    try {
      sid = (JSON.parse(text) as { sid?: string }).sid ?? "";
    } catch {
      sid = "";
    }
    if (!res.ok || !sid) {
      console.error("admin-users: Twilio rejected", res.status, redactProviderBody(text));
      return "failed";
    }
    console.log("admin-users: Twilio ok", sid);
    return "sent";
  } catch (err) {
    console.error("admin-users: Twilio exception", err);
    return "failed";
  }
}

export async function sendInviteSms(
  phone: string | null | undefined,
  env: InviteSmsEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<InviteSmsResult> {
  const destination = inviteSmsDestination(phone);
  if (!destination) return "skipped";
  if ((env.provider ?? "").trim().toLowerCase() === "twilio") {
    return sendViaTwilio(destination, env.twilio, fetchImpl);
  }
  return sendViaSoprano(destination, env, fetchImpl);
}
