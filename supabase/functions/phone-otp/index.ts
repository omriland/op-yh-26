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
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SOPRANO_API_URL = "https://sec.soprano.co.il/";

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

/** Soprano wants 9725… without +. */
function toSopranoDestination(raw: string | null | undefined): string | null {
  const e164 = toE164IlMobile(raw);
  return e164 ? e164.replace(/^\+/, "") : null;
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

function randomOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

async function sendSopranoSms(
  destination972: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = Deno.env.get("SOPRANO_USER");
  const password = Deno.env.get("SOPRANO_PASSWORD");
  const source = Deno.env.get("SOPRANO_SOURCE") || "EvenDerech";
  if (!user || !password) {
    console.error("phone-otp: missing Soprano env");
    return { ok: false, error: "שירות ה-SMS אינו מוגדר. פנו למנהל המערכת." };
  }

  const formData = new URLSearchParams({
    version: "1.0",
    operation: "mt",
    message,
    user,
    password,
    destination: destination972,
    source,
  });

  try {
    const res = await fetch(SOPRANO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("phone-otp: Soprano error", res.status, text);
      return { ok: false, error: "שליחת הקוד נכשלה. נסו שוב בעוד רגע." };
    }
    console.log("phone-otp: Soprano ok", text.slice(0, 120));
    return { ok: true };
  } catch (err) {
    console.error("phone-otp: Soprano exception", err);
    return { ok: false, error: "שליחת הקוד נכשלה. נסו שוב בעוד רגע." };
  }
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
  if (profile.otp_login_enabled && isValidIlMobile(profile.phone)) {
    loginRequired = !(await hasValidDeviceTrust(adminClient, userId, deviceToken));
  }

  let usersPageRequired = false;
  if (profile.otp_users_page_enabled && isValidIlMobile(profile.phone)) {
    usersPageRequired = !(await hasValidStepUp(adminClient, userId, "users_page"));
  }

  return json(200, { loginRequired, usersPageRequired, maskedPhone });
}

function shouldReuseOtpChallenge(
  createdAtIso: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) return false;
  return nowMs - createdMs < cooldownMs;
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
  const nowMs = Date.now();
  const last = startCooldown.get(cooldownKey) ?? 0;
  if (nowMs - last < START_COOLDOWN_MS) {
    // Duplicate start (Strict Mode / race): succeed without rotating the code or SMS.
    const profile = await loadProfile(adminClient, userId);
    return json(200, { ok: true, maskedPhone: maskIlMobile(profile?.phone), reused: true });
  }
  // Claim cooldown immediately so concurrent starts cannot both send SMS.
  startCooldown.set(cooldownKey, nowMs);

  const profile = await loadProfile(adminClient, userId);
  if (!profile) return json(404, { error: "הפרופיל לא נמצא." });

  const flagOn =
    purpose === "login_device" ? profile.otp_login_enabled : profile.otp_users_page_enabled;
  if (!flagOn) {
    return json(400, { error: "אימות SMS אינו פעיל עבור פעולה זו." });
  }

  const destination = toSopranoDestination(profile.phone);
  if (!destination) {
    return json(400, { error: "מספר הטלפון אינו תקין לשליחת SMS." });
  }

  // DB-backed reuse: survives multi-isolate cold starts where the in-memory map is empty.
  const { data: recent } = await adminClient
    .from("otp_challenges")
    .select("id, created_at, expires_at, code_hash")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .gt("expires_at", new Date(nowMs).toISOString())
    .maybeSingle();

  if (
    recent &&
    shouldReuseOtpChallenge(recent.created_at as string, nowMs, START_COOLDOWN_MS)
  ) {
    return json(200, { ok: true, maskedPhone: maskIlMobile(profile.phone), reused: true });
  }

  const code = randomOtpCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(nowMs + CODE_TTL_MS).toISOString();

  const { error: upsertError } = await adminClient.from("otp_challenges").upsert(
    {
      user_id: userId,
      purpose,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      created_at: new Date(nowMs).toISOString(),
    },
    { onConflict: "user_id,purpose" },
  );
  if (upsertError) {
    console.error("phone-otp: challenge upsert failed", upsertError);
    return json(500, { error: "יצירת קוד האימות נכשלה." });
  }

  // Compare-and-swap: if another isolate won the upsert race, do not SMS a stale code.
  const { data: winner } = await adminClient
    .from("otp_challenges")
    .select("code_hash")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .maybeSingle();
  if (!winner || winner.code_hash !== codeHash) {
    return json(200, { ok: true, maskedPhone: maskIlMobile(profile.phone), reused: true });
  }

  const message = `קוד האימות באבן דרך: ${code}`;
  const sent = await sendSopranoSms(destination, message);
  if (!sent.ok) return json(502, { error: sent.error });

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

  const { data: challenge, error: fetchError } = await adminClient
    .from("otp_challenges")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !challenge) {
    return json(400, { error: "הקוד שגוי או שפג תוקפו." });
  }

  if ((challenge.attempts as number) >= MAX_ATTEMPTS) {
    return json(400, { error: "יותר מדי ניסיונות. בקשו קוד חדש." });
  }

  await adminClient
    .from("otp_challenges")
    .update({ attempts: (challenge.attempts as number) + 1 })
    .eq("id", challenge.id);

  const codeHash = await sha256Hex(code);
  if (codeHash !== challenge.code_hash) {
    return json(400, { error: "הקוד שגוי או שפג תוקפו." });
  }

  await adminClient.from("otp_challenges").delete().eq("user_id", userId).eq("purpose", purpose);

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
