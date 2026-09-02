import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import {
  ANDROID_APP_DOWNLOAD_LABEL,
  ANDROID_APP_DOWNLOAD_URL,
  androidDownloadButtonHtml,
} from "../_shared/email.ts";
import { inviteExpiresAt, isInviteExpired } from "../_shared/inviteTtl.ts";

type AppRole = "admin" | "shift_lead" | "responder";

type VehicleInput = { plate_number: string; model: string };

type VolunteerStatus =
  | "administration"
  | "basic_training"
  | "phone_training"
  | "personal_vehicle_training"
  | "shifts_only"
  | "active_volunteer";

const VOLUNTEER_STATUSES: VolunteerStatus[] = [
  "administration",
  "basic_training",
  "phone_training",
  "personal_vehicle_training",
  "shifts_only",
  "active_volunteer",
];

type InviteBody = {
  action: "invite";
  full_name: string;
  email: string;
  callsign: string;
  phone?: string | null;
  volunteer_status?: VolunteerStatus;
  roles: AppRole[];
  vehicles?: VehicleInput[];
};

type DeactivateBody = {
  action: "deactivate" | "reactivate";
  user_id: string;
};

type DeleteBody = {
  action: "delete";
  user_id: string;
};

type ResendInviteBody = {
  action: "resend_invite" | "copy_invite_link";
  user_id: string;
  /** Default true for resend_invite, false for copy_invite_link. */
  send_email?: boolean;
};

type RedeemInviteBody = {
  action: "redeem_invite";
  invite_token: string;
};

type SetPasswordBody = {
  action: "set_password";
  user_id: string;
  password: string;
  force_change?: boolean;
};

type SetEmailBody = {
  action: "set_email";
  user_id: string;
  email: string;
};

type ImpersonateBody = {
  action: "impersonate";
  target_user_id: string;
};

type StopImpersonationBody = {
  action: "stop_impersonation";
  target_user_id: string;
};

type RequestBody =
  | InviteBody
  | DeactivateBody
  | DeleteBody
  | ResendInviteBody
  | RedeemInviteBody
  | SetPasswordBody
  | SetEmailBody
  | ImpersonateBody
  | StopImpersonationBody;

const ALLOWED_ROLES: AppRole[] = ["admin", "shift_lead", "responder"];

const SUPER_ADMIN_LOCK_ERROR = "לא ניתן לערוך מנהל־על.";

async function isSuperAdminRowLocked(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  targetId: string,
): Promise<boolean> {
  const userId = trim(targetId);
  if (!userId) return false;
  const { data, error } = await adminClient.rpc("super_admin_row_locked", {
    target_id: userId,
    actor_id: actorId,
  });
  if (error) {
    console.error("super_admin_row_locked", error);
    return true;
  }
  return Boolean(data);
}

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatPlate(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return raw.trim();
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);
  return runWithCors(corsHeaders, async () => {
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

  // Public: durable invite_token is the secret. Mints a fresh Auth OTP each click.
  if (body.action === "redeem_invite") {
    return handleRedeemInvite(adminClient, body);
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

  if (body.action === "set_password") {
    const { data: isSuperAdmin, error: superError } = await adminClient.rpc("has_role", {
      uid: user.id,
      r: "super_admin",
    });
    if (superError || !isSuperAdmin) {
      return json(403, { error: "אין הרשאה לביצוע פעולה זו." });
    }
    return handleSetPassword(adminClient, body);
  }

  if (body.action === "set_email") {
    const { data: isSuperAdmin, error: superError } = await adminClient.rpc("has_role", {
      uid: user.id,
      r: "super_admin",
    });
    if (superError || !isSuperAdmin) {
      return json(403, { error: "אין הרשאה לביצוע פעולה זו." });
    }
    return handleSetEmail(adminClient, body);
  }

  if (body.action === "impersonate") {
    return handleImpersonate(adminClient, user.id, body);
  }

  if (body.action === "stop_impersonation") {
    return handleStopImpersonation(adminClient, user.id, body);
  }

  const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
    uid: user.id,
    r: "admin",
  });

  if (roleError || !isAdmin) {
    return json(403, { error: "אין לך הרשאה לפעולה זו." });
  }

  if (body.action === "deactivate" || body.action === "reactivate") {
    const locked = await isSuperAdminRowLocked(adminClient, user.id, body.user_id);
    if (locked) return json(403, { error: SUPER_ADMIN_LOCK_ERROR });
    return handleActiveState(adminClient, body);
  }

  if (body.action === "delete") {
    const locked = await isSuperAdminRowLocked(adminClient, user.id, body.user_id);
    if (locked) return json(403, { error: SUPER_ADMIN_LOCK_ERROR });
    return handleDeleteUser(adminClient, user.id, body);
  }

  if (body.action === "invite") {
    return handleInvite(adminClient, body);
  }

  if (body.action === "resend_invite" || body.action === "copy_invite_link") {
    const locked = await isSuperAdminRowLocked(adminClient, user.id, body.user_id);
    if (locked) return json(403, { error: SUPER_ADMIN_LOCK_ERROR });
    return handlePrepareInviteLink(adminClient, body);
  }

  return json(400, { error: "פעולה לא מוכרת." });
  });
});

function passwordStrengthError(password: string): string | null {
  const missing: string[] = [];
  if (password.length < 8) missing.push("8 תווים לפחות");
  if (!/[A-Z]/.test(password)) missing.push("אות גדולה");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("תו מיוחד (למשל !)");
  if (missing.length === 0) return null;
  const list =
    missing.length === 1
      ? missing[0]!
      : missing.length === 2
      ? `${missing[0]} ו${missing[1]}`
      : `${missing.slice(0, -1).join(", ")} ו${missing[missing.length - 1]}`;
  return `הסיסמה אינה עומדת בדרישות. יש לכלול: ${list}.`;
}

async function handleSetPassword(
  adminClient: ReturnType<typeof createClient>,
  body: SetPasswordBody,
) {
  const userId = trim(body.user_id);
  const password = typeof body.password === "string" ? body.password : "";

  if (!userId) {
    return json(400, { error: "חסר מזהה משתמש." });
  }

  const strengthError = passwordStrengthError(password);
  if (strengthError) {
    return json(400, { error: strengthError });
  }

  const forceChange = Boolean(body.force_change);

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  });

  if (authError) {
    console.error("set_password updateUserById", authError.message);
    return json(400, { error: "הגדרת הסיסמה נכשלה." });
  }

  const { error: flagError } = await adminClient
    .from("profiles")
    .update({
      must_change_password: forceChange,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (flagError) {
    console.error("set_password must_change_password", flagError.message);
    return json(500, { error: "הגדרת הסיסמה נכשלה." });
  }

  // Kill every device session so an already-logged-in user cannot skip the gate.
  const { error: revokeError } = await adminClient.rpc("revoke_user_sessions", {
    target_user_id: userId,
  });
  if (revokeError) {
    console.error("set_password revoke_user_sessions", revokeError.message);
    // Password + flag already applied; still report success but log revoke failure.
  }

  return json(200, { ok: true, message: "הסיסמה עודכנה." });
}

function isValidEmailAddress(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function authEmailTaken(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already") ||
    lower.includes("registered") ||
    lower.includes("exists") ||
    lower.includes("unique") ||
    lower.includes("duplicate")
  );
}

async function handleSetEmail(
  adminClient: ReturnType<typeof createClient>,
  body: SetEmailBody,
) {
  const userId = trim(body.user_id);
  const email = trim(body.email).toLowerCase();

  if (!userId) {
    return json(400, { error: "חסר מזהה משתמש." });
  }
  if (!email || !isValidEmailAddress(email)) {
    return json(400, { error: "יש להזין כתובת דוא״ל תקינה." });
  }

  const { data: profile, error: profileReadError } = await adminClient
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();

  if (profileReadError || !profile) {
    console.error("set_email profile read", profileReadError?.message);
    return json(400, { error: "שינוי הדוא״ל נכשל." });
  }

  const previousEmail = trim(profile.email).toLowerCase();
  if (previousEmail === email) {
    return json(200, { ok: true, message: "הדוא״ל עודכן." });
  }

  const { data: taken, error: takenError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", email)
    .neq("id", userId)
    .limit(1)
    .maybeSingle();

  if (takenError) {
    console.error("set_email uniqueness", takenError.message);
    return json(500, { error: "שינוי הדוא״ל נכשל." });
  }
  if (taken) {
    return json(409, { error: "כתובת הדוא״ל כבר בשימוש." });
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  if (authError) {
    console.error("set_email updateUserById", authError.message);
    if (authEmailTaken(authError.message)) {
      return json(409, { error: "כתובת הדוא״ל כבר בשימוש." });
    }
    return json(400, { error: "שינוי הדוא״ל נכשל." });
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    console.error("set_email profile update", profileError.message);
    if (previousEmail) {
      const { error: revertError } = await adminClient.auth.admin.updateUserById(userId, {
        email: previousEmail,
        email_confirm: true,
      });
      if (revertError) {
        console.error("set_email revert auth", revertError.message);
      }
    }
    if (profileError.code === "23505") {
      return json(409, { error: "כתובת הדוא״ל כבר בשימוש." });
    }
    return json(500, { error: "שינוי הדוא״ל נכשל." });
  }

  return json(200, { ok: true, message: "הדוא״ל עודכן." });
}

async function writeImpersonationAudit(
  adminClient: ReturnType<typeof createClient>,
  row: {
    actor_user_id: string;
    target_user_id: string | null;
    action: "started" | "stopped" | "denied";
    reason?: string | null;
  },
) {
  const { error } = await adminClient.from("impersonation_audit").insert({
    actor_user_id: row.actor_user_id,
    target_user_id: row.target_user_id,
    action: row.action,
    reason: row.reason ?? null,
  });
  if (error) {
    console.error("impersonation_audit", error.message);
  }
}

async function handleImpersonate(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  body: ImpersonateBody,
) {
  const { data: isSuperAdmin, error: superError } = await adminClient.rpc("has_role", {
    uid: actorId,
    r: "super_admin",
  });
  if (superError || !isSuperAdmin) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: trim(body.target_user_id) || null,
      action: "denied",
      reason: "not_super_admin",
    });
    return json(403, { error: "אין הרשאה לביצוע פעולה זו." });
  }

  const targetId = trim(body.target_user_id);
  if (!targetId) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: null,
      action: "denied",
      reason: "missing",
    });
    return json(403, { error: "לא ניתן לצפות כמשתמש זה." });
  }

  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("id, full_name, callsign, email, active")
    .eq("id", targetId)
    .maybeSingle();

  if (targetError || !target) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "missing",
    });
    return json(403, { error: "לא ניתן לצפות כמשתמש זה." });
  }

  if (!target.active) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "inactive",
    });
    return json(403, { error: "לא ניתן לצפות כמשתמש זה." });
  }

  if (target.id === actorId) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "self",
    });
    return json(403, { error: "לא ניתן לצפות כמשתמש זה." });
  }

  const { data: targetIsSuper, error: targetRoleError } = await adminClient.rpc("has_role", {
    uid: targetId,
    r: "super_admin",
  });
  if (targetRoleError) {
    return json(500, { error: "פתיחת הצפייה נכשלה. נסו שוב." });
  }
  if (targetIsSuper) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "is_super_admin",
    });
    return json(403, { error: "לא ניתן לצפות כמשתמש זה." });
  }

  const email = typeof target.email === "string" ? target.email.trim() : "";
  if (!email) {
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "missing",
    });
    return json(403, { error: "לא ניתן לצפות כמשתמש זה." });
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    console.error("impersonate generateLink", linkError?.message);
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "mint_failed",
    });
    return json(500, { error: "פתיחת הצפייה נכשלה. נסו שוב." });
  }

  const { data: otpData, error: otpError } = await adminClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });

  const accessToken = otpData.session?.access_token;
  const refreshToken = otpData.session?.refresh_token;
  if (otpError || !accessToken || !refreshToken) {
    console.error("impersonate verifyOtp", otpError?.message);
    await writeImpersonationAudit(adminClient, {
      actor_user_id: actorId,
      target_user_id: targetId,
      action: "denied",
      reason: "mint_failed",
    });
    return json(500, { error: "פתיחת הצפייה נכשלה. נסו שוב." });
  }

  await writeImpersonationAudit(adminClient, {
    actor_user_id: actorId,
    target_user_id: targetId,
    action: "started",
  });

  return json(200, {
    ok: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    target: {
      id: target.id,
      full_name: target.full_name,
      callsign: target.callsign,
    },
  });
}

async function handleStopImpersonation(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  body: StopImpersonationBody,
) {
  const { data: isSuperAdmin, error: superError } = await adminClient.rpc("has_role", {
    uid: actorId,
    r: "super_admin",
  });
  if (superError || !isSuperAdmin) {
    return json(403, { error: "אין הרשאה לביצוע פעולה זו." });
  }

  const targetId = trim(body.target_user_id);
  if (!targetId) {
    return json(400, { error: "חסר מזהה משתמש." });
  }

  await writeImpersonationAudit(adminClient, {
    actor_user_id: actorId,
    target_user_id: targetId,
    action: "stopped",
  });

  return json(200, { ok: true });
}

async function handleActiveState(
  adminClient: ReturnType<typeof createClient>,
  body: DeactivateBody,
) {
  const userId = trim(body.user_id);
  if (!userId) {
    return json(400, { error: "חסר מזהה משתמש." });
  }

  const active = body.action === "reactivate";
  const banDuration = active ? "none" : "876600h";

  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: banDuration,
  });

  if (banError) {
    return json(400, {
      error: active
        ? "הפעלת המשתמש נכשלה. נסו שוב."
        : "השבתת המשתמש נכשלה. נסו שוב.",
    });
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (profileError) {
    return json(500, { error: "עדכון הפרופיל נכשל. בדקו את החיבור ונסו שוב." });
  }

  return json(200, {
    ok: true,
    message: active ? "המשתמש הופעל מחדש." : "המשתמש הושבת.",
  });
}

async function handleDeleteUser(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  body: DeleteBody,
) {
  const userId = trim(body.user_id);
  if (!userId) {
    return json(400, { error: "חסר מזהה משתמש." });
  }

  if (userId === actorId) {
    return json(400, { error: "לא ניתן למחוק את המשתמש המחובר כעת." });
  }

  const { data: profile, error: profileLookupError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileLookupError) {
    return json(500, { error: "בדיקת המשתמש נכשלה. נסו שוב." });
  }
  if (!profile) {
    return json(404, { error: "המשתמש לא נמצא." });
  }

  const [{ count: eventsAsLead }, { count: shiftsAsLead }] = await Promise.all([
    adminClient
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("shift_lead_id", userId),
    adminClient
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("shift_lead_id", userId),
  ]);

  if ((eventsAsLead ?? 0) > 0 || (shiftsAsLead ?? 0) > 0) {
    return json(409, {
      error:
        "לא ניתן למחוק משתמש שהוא אחמ״ש על אירועים או משמרות. השביתו אותו או העבירו את האחריות קודם.",
    });
  }

  // Drop participation rows so profile/auth delete is not blocked by FKs.
  const { error: eventRespondersError } = await adminClient
    .from("event_responders")
    .delete()
    .eq("responder_id", userId);
  if (eventRespondersError) {
    return json(500, { error: "מחיקת שיוכי האירועים נכשלה. נסו שוב." });
  }

  const { error: shiftRespondersError } = await adminClient
    .from("shift_responders")
    .delete()
    .eq("responder_id", userId);
  if (shiftRespondersError) {
    return json(500, { error: "מחיקת שיוכי המשמרות נכשלה. נסו שוב." });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json(400, {
      error: "מחיקת המשתמש נכשלה. נסו שוב.",
      detail: deleteError.message,
    });
  }

  return json(200, { ok: true, message: "המשתמש נמחק." });
}

/** Email / copy URL — durable app token, reusable until password is set. */
function buildDurableInviteLink(inviteToken: string, redirectBase: string): string {
  const inviteUrl = new URL(redirectBase);
  inviteUrl.searchParams.set("set_password", "1");
  inviteUrl.searchParams.set("type", "invite");
  inviteUrl.searchParams.set("invite_token", inviteToken);
  return inviteUrl.toString();
}

function newInviteTokenRow() {
  const inviteToken = crypto.randomUUID();
  const expiresAt = inviteExpiresAt();
  return { inviteToken, expiresAt };
}

async function mintFreshAuthOtp(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  redirectBase: string,
) {
  // `type: "invite"` reuses the confirmation token from user creation.
  // Auth then treats that original OTP as expired (often within an hour),
  // so a still-valid 24h durable link looks dead. Magiclink/recovery mint
  // a new one-time token on every click.
  for (const type of ["magiclink", "recovery"] as const) {
    const attempt = await adminClient.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo: redirectBase },
    });
    const message = attempt.error?.message?.toLowerCase() ?? "";
    if (message.includes("rate limit")) {
      return { token_hash: null, type: null, error: "rate_limit" as const };
    }
    const hashed = attempt.data?.properties?.hashed_token;
    if (!attempt.error && hashed) {
      return {
        token_hash: hashed as string,
        type: (attempt.data.properties.verification_type || type) as string,
        error: null as string | null,
      };
    }
  }

  return {
    token_hash: null,
    type: null,
    error: "mint_failed",
  };
}

async function handleRedeemInvite(
  adminClient: ReturnType<typeof createClient>,
  body: RedeemInviteBody,
) {
  const inviteToken = trim(body.invite_token);
  if (!inviteToken) {
    return json(400, { error: "קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה." });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select(
      "id, email, full_name, callsign, phone, active, invite_pending, invite_token_expires_at",
    )
    .eq("invite_token", inviteToken)
    .maybeSingle();

  if (profileError || !profile) {
    return json(400, { error: "קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה." });
  }

  if (profile.active === false) {
    return json(400, { error: "המשתמש מושבת. פנו למנהל המערכת." });
  }

  if (!profile.invite_pending) {
    return json(400, { error: "ההרשמה כבר הושלמה. אפשר להתחבר עם הסיסמה שנבחרה." });
  }

  if (isInviteExpired(profile.invite_token_expires_at)) {
    return json(400, { error: "קישור ההזמנה פג תוקף. בקשו הזמנה חדשה." });
  }

  const email = trim(profile.email).toLowerCase();
  if (!email) {
    return json(400, { error: "למשתמש אין כתובת דוא״ל." });
  }

  const redirectBase = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";
  const minted = await mintFreshAuthOtp(adminClient, email, redirectBase);

  if (minted.error === "rate_limit") {
    return json(429, { error: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות." });
  }
  if (!minted.token_hash || !minted.type) {
    return json(400, {
      error: "אימות ההזמנה נכשל. נסו שוב.",
      detail: minted.error,
    });
  }

  return json(200, {
    ok: true,
    token_hash: minted.token_hash,
    type: minted.type,
  });
}

async function handlePrepareInviteLink(
  adminClient: ReturnType<typeof createClient>,
  body: ResendInviteBody,
) {
  const userId = trim(body.user_id);
  if (!userId) {
    return json(400, { error: "חסר מזהה משתמש." });
  }

  const sendEmail = body.send_email ?? body.action === "resend_invite";

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    return json(404, { error: "המשתמש לא נמצא." });
  }

  const email = (authData.user.email ?? "").trim().toLowerCase();
  if (!email) {
    return json(400, { error: "למשתמש אין כתובת דוא״ל." });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("full_name, callsign, phone, active, invite_pending")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return json(404, { error: "הפרופיל לא נמצא." });
  }

  if (profile.active === false) {
    return json(400, { error: "לא ניתן לשלוח הזמנה למשתמש מושבת. הפעילו אותו תחילה." });
  }

  if (!profile.invite_pending) {
    return json(400, { error: "המשתמש כבר השלים הרשמה. אין צורך בהזמנה מחדש." });
  }

  const redirectBase = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";
  const fullName = trim(profile.full_name) || email;
  const { inviteToken, expiresAt } = newInviteTokenRow();
  const actionLink = buildDurableInviteLink(inviteToken, redirectBase);

  const { error: tokenError } = await adminClient
    .from("profiles")
    .update({
      invite_pending: true,
      invite_token: inviteToken,
      invite_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (tokenError) {
    return json(500, { error: "יצירת קישור ההזמנה נכשלה." });
  }

  if (sendEmail) {
    const mail = await sendInviteEmail(email, fullName, actionLink);
    if (mail.error) {
      return json(400, { error: mail.error, detail: mail.detail });
    }
  }

  return json(200, {
    ok: true,
    action_link: actionLink,
    message: sendEmail ? "ההזמנה נשלחה מחדש." : "קישור ההזמנה הועתק.",
  });
}

async function sendInviteEmail(to: string, fullName: string, actionLink: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { error: "חסר מפתח Resend בשרת. פנו למנהל המערכת." };
  }

  const text = [
    "אבן דרך",
    "יחפ״צ · היחידה הארצית לפינוי צירים",
    "",
    `שלום ${fullName},`,
    "",
    "הוזמנת למערכת 'אבן דרך' - מערכת הניהול של היחידה הארצית לפינוי צירים.",
    "לכניסה ראשונית למערכת והגדרת סיסמה, יש ללחוץ על הקישור:",
    actionLink,
    "",
    `או להעתיק את הכתובת: ${actionLink}`,
    "",
    "הקישור בתוקף ל־24 שעות.",
    "",
    "אחרי השלמת הרישום אפשר להוריד את האפליקציה לטלפון:",
    `${ANDROID_APP_DOWNLOAD_LABEL}: ${ANDROID_APP_DOWNLOAD_URL}`,
    "",
    "אם לא ציפית להזמנה זו, ניתן להתעלם מההודעה",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "אבן דרך - יחפ״צ <invites@send.yahpz.com>",
      to: [to],
      subject: 'הוזמנת למערכת אבן דרך - יחפ״צ',
      text,
      html: `
        <div dir="rtl" lang="he" style="margin:0;padding:0;background:#F6F8FA;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FA;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #DDE4EB;">
                  <tr>
                    <td style="background:#182A47;padding:20px 24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#F2F6FA;letter-spacing:0.02em;">אבן דרך</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#DDE4EB;margin-top:4px;">יחפ״צ · היחידה הארצית לפינוי צירים</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#0F1B2D;text-align:right;">
                      <p style="margin:0 0 16px;">שלום ${fullName},</p>
                      <p style="margin:0 0 16px;">הוזמנת למערכת 'אבן דרך' - מערכת הניהול של היחידה הארצית לפינוי צירים.</p>
                      <p style="margin:0 0 24px;">לכניסה ראשונית למערכת והגדרת סיסמה, יש ללחוץ על הקישור.</p>
                      <p style="margin:0 0 28px;text-align:center;">
                        <a href="${actionLink}" style="display:inline-block;background:#1D4E89;color:#FFFFFF;text-decoration:none;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;border-radius:4px;">להשלמת הרישום</a>
                      </p>
                      <p style="margin:0 0 16px;font-size:13px;color:#5B6F86;word-break:break-all;">
                        או להעתיק את הכתובת: ${actionLink}
                      </p>
                      <p style="margin:0 0 20px;font-size:14px;color:#5B6F86;">הקישור בתוקף ל־24 שעות.</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                        <tr>
                          <td style="border-top:1px solid #DDE4EB;font-size:0;line-height:0;height:1px;">&nbsp;</td>
                        </tr>
                      </table>
                      <p style="margin:0 0 16px;">אחרי השלמת הרישום אפשר להוריד את האפליקציה לטלפון:</p>
                      ${androidDownloadButtonHtml()}
                      <p style="margin:0;font-size:14px;color:#5B6F86;">אם לא ציפית להזמנה זו, ניתן להתעלם מההודעה</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { error: "שליחת ההזמנה בדוא״ל נכשלה. בדקו את החיבור ונסו שוב.", detail };
  }

  return { error: null };
}

async function handleInvite(
  adminClient: ReturnType<typeof createClient>,
  body: InviteBody,
) {
  const fullName = trim(body.full_name);
  const email = trim(body.email).toLowerCase();
  const callsign = trim(body.callsign);
  const phone = trim(body.phone ?? "") || null;
  const volunteerStatus = VOLUNTEER_STATUSES.includes(body.volunteer_status as VolunteerStatus)
    ? (body.volunteer_status as VolunteerStatus)
    : "active_volunteer";
  const roles = Array.isArray(body.roles)
    ? [...new Set(body.roles.filter((role): role is AppRole => ALLOWED_ROLES.includes(role)))]
    : [];
  const vehicles = Array.isArray(body.vehicles) ? body.vehicles : [];

  if (!fullName || !email || !callsign) {
    return json(400, { error: "יש למלא שם מלא, דוא״ל ואו״ק." });
  }

  if (roles.length === 0) {
    return json(400, { error: "יש לבחור לפחות תפקיד אחד." });
  }

  const seenPlates = new Set<string>();
  for (const vehicle of vehicles) {
    if (!trim(vehicle.plate_number) || !trim(vehicle.model)) {
      return json(400, { error: "לכל רכב נדרשים לוחית רישוי ודגם." });
    }
    const plate = trim(vehicle.plate_number).replace(/\D/g, "") || trim(vehicle.plate_number);
    if (seenPlates.has(plate)) {
      return json(400, {
        error: "לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.",
      });
    }
    seenPlates.add(plate);
  }

  // Create Auth user via generateLink (no Supabase mailer). Email uses a
  // durable invite_token — Auth OTP is minted later on each redeem click.
  const redirectBase = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: fullName,
        callsign,
        phone: phone ?? "",
      },
      redirectTo: redirectBase,
    },
  });

  if (linkError || !linkData.user) {
    const message = linkError?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return json(409, { error: "המשתמש כבר קיים במערכת." });
    }
    if (message.includes("rate limit")) {
      return json(429, { error: "נשלחו יותר מדי הזמנות. נסו שוב בעוד כמה דקות." });
    }
    if (message.includes("invalid")) {
      return json(400, { error: "כתובת הדוא״ל אינה תקינה." });
    }
    return json(400, {
      error: "יצירת ההזמנה נכשלה. בדקו את כתובת הדוא״ל ונסו שוב.",
      detail: linkError?.message,
    });
  }

  const userId = linkData.user.id;
  const { inviteToken, expiresAt } = newInviteTokenRow();
  const actionLink = buildDurableInviteLink(inviteToken, redirectBase);

  const mail = await sendInviteEmail(email, fullName, actionLink);
  if (mail.error) {
    return json(400, { error: mail.error, detail: mail.detail });
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      full_name: fullName,
      callsign,
      phone,
      email,
      active: true,
      volunteer_status: volunteerStatus,
      invite_pending: true,
      invite_token: inviteToken,
      invite_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    return json(500, { error: "יצירת הפרופיל נכשלה לאחר ההזמנה." });
  }

  await adminClient.from("user_roles").delete().eq("user_id", userId);
  const { error: rolesError } = await adminClient.from("user_roles").insert(
    roles.map((role) => ({ user_id: userId, role })),
  );

  if (rolesError) {
    return json(500, { error: "שמירת התפקידים נכשלה." });
  }

  await adminClient.from("vehicles").delete().eq("user_id", userId);
  if (vehicles.length > 0) {
    const { error: vehiclesError } = await adminClient.from("vehicles").insert(
      vehicles.map((vehicle) => ({
        user_id: userId,
        plate_number: formatPlate(trim(vehicle.plate_number)),
        model: trim(vehicle.model),
      })),
    );

    if (vehiclesError) {
      return json(500, { error: "שמירת הרכבים נכשלה." });
    }
  }

  return json(200, {
    ok: true,
    user_id: userId,
    action_link: actionLink,
    message: "משתמש נוצר בהצלחה",
  });
}
