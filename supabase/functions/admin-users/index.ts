import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AppRole = "admin" | "shift_lead" | "responder";

type VehicleInput = { plate_number: string; model: string };

type InviteBody = {
  action: "invite";
  full_name: string;
  email: string;
  callsign: string;
  phone?: string | null;
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

type RequestBody =
  | InviteBody
  | DeactivateBody
  | DeleteBody
  | ResendInviteBody
  | RedeemInviteBody;

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_ROLES: AppRole[] = ["admin", "shift_lead", "responder"];

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
    uid: user.id,
    r: "admin",
  });

  if (roleError || !isAdmin) {
    return json(403, { error: "אין לך הרשאה לפעולה זו." });
  }

  if (body.action === "deactivate" || body.action === "reactivate") {
    return handleActiveState(adminClient, body);
  }

  if (body.action === "delete") {
    return handleDeleteUser(adminClient, user.id, body);
  }

  if (body.action === "invite") {
    return handleInvite(adminClient, body);
  }

  if (body.action === "resend_invite" || body.action === "copy_invite_link") {
    return handlePrepareInviteLink(adminClient, body);
  }

  return json(400, { error: "פעולה לא מוכרת." });
});

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
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  return { inviteToken, expiresAt };
}

async function mintFreshAuthOtp(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  fullName: string,
  callsign: string,
  phone: string,
  redirectBase: string,
) {
  const inviteAttempt = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name: fullName, callsign, phone },
      redirectTo: redirectBase,
    },
  });

  if (!inviteAttempt.error && inviteAttempt.data?.properties?.hashed_token) {
    return {
      token_hash: inviteAttempt.data.properties.hashed_token as string,
      type: (inviteAttempt.data.properties.verification_type || "invite") as string,
      error: null as string | null,
    };
  }

  const message = inviteAttempt.error?.message?.toLowerCase() ?? "";
  if (message.includes("rate limit")) {
    return { token_hash: null, type: null, error: "rate_limit" as const };
  }

  const alreadyRegistered =
    message.includes("already") ||
    message.includes("registered") ||
    message.includes("exists");

  if (!alreadyRegistered && inviteAttempt.error) {
    return {
      token_hash: null,
      type: null,
      error: inviteAttempt.error.message,
    };
  }

  const recovery = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: redirectBase },
  });
  if (recovery.error || !recovery.data?.properties?.hashed_token) {
    return {
      token_hash: null,
      type: null,
      error: recovery.error?.message ?? "recovery_failed",
    };
  }

  return {
    token_hash: recovery.data.properties.hashed_token as string,
    type: (recovery.data.properties.verification_type || "recovery") as string,
    error: null as string | null,
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

  if (
    profile.invite_token_expires_at &&
    new Date(profile.invite_token_expires_at).getTime() < Date.now()
  ) {
    return json(400, { error: "קישור ההזמנה פג תוקף. בקשו הזמנה חדשה." });
  }

  const email = trim(profile.email).toLowerCase();
  if (!email) {
    return json(400, { error: "למשתמש אין כתובת דוא״ל." });
  }

  const redirectBase = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";
  const minted = await mintFreshAuthOtp(
    adminClient,
    email,
    trim(profile.full_name) || email,
    trim(profile.callsign),
    trim(profile.phone ?? "") || "",
    redirectBase,
  );

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
    "אם לא ציפית להזמנה זו, ניתן להתעלם מההודעה.",
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
      subject: 'הזמנה למערכת אבן דרך - יחפ״צ',
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
                        או העתיקו את הכתובת: ${actionLink}
                      </p>
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
        plate_number: trim(vehicle.plate_number).replace(/\D/g, "") || trim(vehicle.plate_number),
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
