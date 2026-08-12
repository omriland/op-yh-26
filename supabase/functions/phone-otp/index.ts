import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type OtpPurpose = "login_device" | "users_page";

type SetOtpFlagsBody = {
  action: "set_otp_flags";
  user_id: string;
  otp_login_enabled?: boolean;
  otp_users_page_enabled?: boolean;
};

type OtpStatusBody = { action: "otp_status" };

type OtpStartBody = {
  action: "otp_start";
  purpose: OtpPurpose;
};

type OtpVerifyBody = {
  action: "otp_verify";
  purpose: OtpPurpose;
  code: string;
};

type RequestBody = SetOtpFlagsBody | OtpStatusBody | OtpStartBody | OtpVerifyBody;

const DEVICE_HEADER = "x-yahpaz-otp-device";
const IMPERSONATING_HEADER = "x-yahpaz-impersonating";
const LOGIN_TRUST_MS = 48 * 60 * 60 * 1000;
const STEP_UP_MS = 20 * 60 * 1000;
const START_COOLDOWN_MS = 60 * 1000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-yahpaz-otp-device, x-yahpaz-impersonating",
};

const startCooldown = new Map<string, number>();

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

function isValidIlMobile(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = phoneDigits(raw);
  return digits.length === 10 && digits.startsWith("05");
}

function toE164IlMobile(raw: string | null | undefined): string | null {
  if (!isValidIlMobile(raw)) return null;
  return `+972${phoneDigits(raw!).slice(1)}`;
}

function maskIlMobile(raw: string | null | undefined): string | null {
  if (!isValidIlMobile(raw)) return null;
  const digits = phoneDigits(raw!);
  return `${digits.slice(0, 3)}-***-${digits.slice(6)}`;
}

function isImpersonating(req: Request): boolean {
  return req.headers.get(IMPERSONATING_HEADER)?.trim() === "1";
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function twilioStartVerification(to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!accountSid || !authToken || !serviceSid) {
    console.error("phone-otp: missing Twilio env");
    return { ok: false, error: "שירות ה-SMS אינו מוגדר. פנו למנהל המערכת." };
  }

  const body = new URLSearchParams({ To: to, Channel: "sms" });
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    console.error("phone-otp: Twilio verification start failed", res.status, detail);
    return { ok: false, error: "שליחת הקוד נכשלה. נסו שוב בעוד רגע." };
  }
  return { ok: true };
}

async function twilioCheckVerification(
  to: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!accountSid || !authToken || !serviceSid) {
    console.error("phone-otp: missing Twilio env");
    return { ok: false, error: "שירות ה-SMS אינו מוגדר. פנו למנהל המערכת." };
  }

  const body = new URLSearchParams({ To: to, Code: code });
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const payload = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
  if (!res.ok || payload.status !== "approved") {
    return { ok: false, error: "הקוד שגוי או שפג תוקפו." };
  }
  return { ok: true };
}

type ProfileOtpRow = {
  phone: string | null;
  otp_login_enabled: boolean;
  otp_users_page_enabled: boolean;
};

async function loadProfile(
  adminClient: SupabaseClient,
  userId: string,
): Promise<ProfileOtpRow | null> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("phone, otp_login_enabled, otp_users_page_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileOtpRow;
}

async function hasValidDeviceTrust(
  adminClient: SupabaseClient,
  userId: string,
  deviceToken: string | null,
): Promise<boolean> {
  if (!deviceToken) return false;
  const hash = await sha256Hex(deviceToken);
  const { data, error } = await adminClient
    .from("otp_device_trust")
    .select("id, trusted_until")
    .eq("user_id", userId)
    .eq("device_key_hash", hash)
    .gt("trusted_until", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return false;
  await adminClient
    .from("otp_device_trust")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);
  return true;
}

async function hasValidStepUp(
  adminClient: SupabaseClient,
  userId: string,
  purpose: "users_page",
): Promise<boolean> {
  const { data, error } = await adminClient
    .from("otp_step_up")
    .select("id")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .gt("valid_until", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return !error && !!data;
}

async function handleSetOtpFlags(
  adminClient: SupabaseClient,
  actorId: string,
  body: SetOtpFlagsBody,
) {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) return json(400, { error: "חסר מזהה משתמש." });

  if (body.otp_login_enabled === undefined && body.otp_users_page_enabled === undefined) {
    return json(400, { error: "לא צוין דגל לעדכון." });
  }

  const profile = await loadProfile(adminClient, userId);
  if (!profile) return json(404, { error: "המשתמש לא נמצא." });

  const nextLogin = body.otp_login_enabled ?? profile.otp_login_enabled;
  const nextUsers = body.otp_users_page_enabled ?? profile.otp_users_page_enabled;

  if ((nextLogin || nextUsers) && !isValidIlMobile(profile.phone)) {
    return json(400, { error: "יש להזין מספר נייד ישראלי תקין לפני הפעלת OTP." });
  }

  const { error } = await adminClient
    .from("profiles")
    .update({
      otp_login_enabled: nextLogin,
      otp_users_page_enabled: nextUsers,
      otp_flags_updated_at: new Date().toISOString(),
      otp_flags_updated_by: actorId,
    })
    .eq("id", userId);

  if (error) {
    console.error("phone-otp: set_otp_flags failed", error);
    return json(500, { error: "עדכון דגלי OTP נכשל." });
  }

  return json(200, { ok: true, message: "דגלי OTP עודכנו." });
}

async function handleOtpStatus(
  adminClient: SupabaseClient,
  userId: string,
  req: Request,
) {
  if (isImpersonating(req)) {
    return json(200, {
      loginRequired: false,
      usersPageRequired: false,
      maskedPhone: null,
    });
  }

  const profile = await loadProfile(adminClient, userId);
  if (!profile) return json(404, { error: "הפרופיל לא נמצא." });

  const maskedPhone = maskIlMobile(profile.phone);
  const deviceToken = req.headers.get(DEVICE_HEADER)?.trim() || null;

  let loginRequired = false;
  if (profile.otp_login_enabled) {
    if (!isValidIlMobile(profile.phone)) {
      loginRequired = false;
    } else {
      loginRequired = !(await hasValidDeviceTrust(adminClient, userId, deviceToken));
    }
  }

  let usersPageRequired = false;
  if (profile.otp_users_page_enabled) {
    if (!isValidIlMobile(profile.phone)) {
      usersPageRequired = false;
    } else {
      usersPageRequired = !(await hasValidStepUp(adminClient, userId, "users_page"));
    }
  }

  return json(200, { loginRequired, usersPageRequired, maskedPhone });
}

async function handleOtpStart(
  adminClient: SupabaseClient,
  userId: string,
  req: Request,
  body: OtpStartBody,
) {
  if (isImpersonating(req)) {
    return json(403, { error: "לא ניתן לשלוח OTP במצב צפייה כמשתמש." });
  }

  const purpose = body.purpose;
  if (purpose !== "login_device" && purpose !== "users_page") {
    return json(400, { error: "מטרת האימות אינה תקינה." });
  }

  const cooldownKey = `${userId}:${purpose}`;
  const last = startCooldown.get(cooldownKey) ?? 0;
  if (Date.now() - last < START_COOLDOWN_MS) {
    return json(429, { error: "יש להמתין לפני שליחה חוזרת." });
  }

  const profile = await loadProfile(adminClient, userId);
  if (!profile) return json(404, { error: "הפרופיל לא נמצא." });

  const flagOn =
    purpose === "login_device" ? profile.otp_login_enabled : profile.otp_users_page_enabled;
  if (!flagOn) {
    return json(400, { error: "אימות SMS אינו פעיל עבור פעולה זו." });
  }

  const e164 = toE164IlMobile(profile.phone);
  if (!e164) {
    return json(400, { error: "מספר הטלפון אינו תקין לשליחת SMS." });
  }

  const started = await twilioStartVerification(e164);
  if (!started.ok) return json(502, { error: started.error });

  startCooldown.set(cooldownKey, Date.now());
  return json(200, { ok: true, maskedPhone: maskIlMobile(profile.phone) });
}

async function handleOtpVerify(
  adminClient: SupabaseClient,
  userId: string,
  req: Request,
  body: OtpVerifyBody,
) {
  if (isImpersonating(req)) {
    return json(403, { error: "לא ניתן לאמת OTP במצב צפייה כמשתמש." });
  }

  const purpose = body.purpose;
  if (purpose !== "login_device" && purpose !== "users_page") {
    return json(400, { error: "מטרת האימות אינה תקינה." });
  }

  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (code.length < 4 || code.length > 10) {
    return json(400, { error: "הקוד שגוי או שפג תוקפו." });
  }

  const profile = await loadProfile(adminClient, userId);
  if (!profile) return json(404, { error: "הפרופיל לא נמצא." });

  const flagOn =
    purpose === "login_device" ? profile.otp_login_enabled : profile.otp_users_page_enabled;
  if (!flagOn) {
    return json(400, { error: "אימות SMS אינו פעיל עבור פעולה זו." });
  }

  const e164 = toE164IlMobile(profile.phone);
  if (!e164) {
    return json(400, { error: "מספר הטלפון אינו תקין לשליחת SMS." });
  }

  const checked = await twilioCheckVerification(e164, code);
  if (!checked.ok) return json(400, { error: checked.error });

  if (purpose === "login_device") {
    const deviceToken = randomDeviceToken();
    const hash = await sha256Hex(deviceToken);
    const trustedUntil = new Date(Date.now() + LOGIN_TRUST_MS).toISOString();
    const now = new Date().toISOString();

    const { error } = await adminClient.from("otp_device_trust").upsert(
      {
        user_id: userId,
        device_key_hash: hash,
        trusted_until: trustedUntil,
        last_seen_at: now,
      },
      { onConflict: "user_id,device_key_hash" },
    );

    if (error) {
      console.error("phone-otp: trust upsert failed", error);
      return json(500, { error: "שמירת אמון המכשיר נכשלה." });
    }

    return json(200, { ok: true, deviceToken });
  }

  const { error } = await adminClient.from("otp_step_up").insert({
    user_id: userId,
    purpose: "users_page",
    valid_until: new Date(Date.now() + STEP_UP_MS).toISOString(),
  });

  if (error) {
    console.error("phone-otp: step_up insert failed", error);
    return json(500, { error: "שמירת האימות נכשלה." });
  }

  return json(200, { ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "שיטת הבקשה אינה נתמכת." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "הגדרות השרת חסרות. פנו למנהל המערכת." });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: "גוף הבקשה אינו תקין." });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "יש להתחבר מחדש." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json(401, { error: "יש להתחבר מחדש." });
  }

  if (body.action === "otp_status") {
    return handleOtpStatus(adminClient, user.id, req);
  }

  if (body.action === "otp_start") {
    return handleOtpStart(adminClient, user.id, req, body);
  }

  if (body.action === "otp_verify") {
    return handleOtpVerify(adminClient, user.id, req, body);
  }

  if (body.action === "set_otp_flags") {
    const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
      uid: user.id,
      r: "admin",
    });
    if (roleError || !isAdmin) {
      return json(403, { error: "אין לך הרשאה לפעולה זו." });
    }
    return handleSetOtpFlags(adminClient, user.id, body);
  }

  return json(400, { error: "פעולה לא מוכרת." });
});
