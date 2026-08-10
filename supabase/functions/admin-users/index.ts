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

type RequestBody = InviteBody | DeactivateBody;

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "יש להתחבר מחדש." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

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

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: "גוף הבקשה אינו תקין." });
  }

  if (body.action === "deactivate" || body.action === "reactivate") {
    return handleActiveState(adminClient, body);
  }

  if (body.action === "invite") {
    return handleInvite(adminClient, body);
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

async function sendInviteEmail(to: string, fullName: string, actionLink: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { error: "חסר מפתח Resend בשרת. פנו למנהל המערכת." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "אבן דרך - יחפ״צ <onboarding@send.responders-tlv.com>",
      to: [to],
      subject: 'הזמנה למערכת אבן דרך - יחפ״צ',
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
                      <p style="margin:0 0 24px;">לכניסה ראשונית למערכת והגדרת סיסמא, יש ללחוץ על הקישור.</p>
                      <p style="margin:0 0 28px;text-align:center;">
                        <a href="${actionLink}" style="display:inline-block;background:#1D4E89;color:#FFFFFF;text-decoration:none;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;border-radius:4px;">להשלמת הרישום</a>
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

  // App requires ?set_password=1 (or hash type=invite) so the SPA shows
  // password choice instead of treating the invite session as a normal login.
  const redirectBase = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";
  const redirectUrl = new URL(redirectBase);
  redirectUrl.searchParams.set("set_password", "1");
  const redirectTo = redirectUrl.toString();

  // generateLink creates the Auth user and returns the invite URL without using
  // Supabase's built-in mailer (which is rate-limited until custom SMTP is on).
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: fullName,
        callsign,
        phone: phone ?? "",
      },
      redirectTo,
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

  const actionLink = linkData.properties.action_link;
  if (!actionLink) {
    return json(500, { error: "יצירת קישור ההזמנה נכשלה." });
  }

  const mail = await sendInviteEmail(email, fullName, actionLink);
  if (mail.error) {
    return json(400, { error: mail.error, detail: mail.detail });
  }

  const userId = linkData.user.id;

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      full_name: fullName,
      callsign,
      phone,
      email,
      active: true,
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
    message: "המשתמש נוצר ונשלחה הזמנה בדוא״ל",
  });
}
