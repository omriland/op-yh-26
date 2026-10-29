/**
 * SMS that rides along with the initial-login invite email.
 * One body, no link and no password. Soprano is the existing gateway
 * (`SOPRANO_USER` / `SOPRANO_PASSWORD` / `SOPRANO_SOURCE`).
 */
export const INVITE_SMS_BODY =
  "הוזמנת למערכת 'אבן דרך'. פרטי התחברות ראשוניים מופיעים בתיבת המייל שלך";

const SOPRANO_API_URL = "https://sec.soprano.co.il/";

export type SopranoCredentials = {
  user?: string;
  password?: string;
  source?: string;
};

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

export async function sendInviteSms(
  phone: string | null | undefined,
  env: SopranoCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<"sent" | "skipped" | "failed"> {
  const destination = inviteSmsDestination(phone);
  if (!destination) return "skipped";
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
    if (!res.ok) {
      console.error("admin-users: Soprano error", res.status);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("admin-users: Soprano exception", err);
    return "failed";
  }
}
