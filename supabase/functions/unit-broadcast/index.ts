import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type BroadcastChannel = "email" | "sms" | "both";
type BroadcastAudience = "all" | "admins" | "shift_leads";

type SendBody = {
  action: "send";
  channel: BroadcastChannel;
  audience: BroadcastAudience;
  subject?: string;
  body: string;
};

const SOPRANO_API_URL = "https://sec.soprano.co.il/";
const SUBJECT_MAX = 200;
const BODY_MAX = 2000;
const IMPERSONATING_HEADER = "x-yahpaz-impersonating";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-yahpaz-impersonating",
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

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

function isValidIlMobile(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = phoneDigits(raw);
  return digits.length === 10 && digits.startsWith("05");
}

function toSopranoDestination(raw: string | null | undefined): string | null {
  if (!isValidIlMobile(raw)) return null;
  return `972${phoneDigits(raw!).slice(1)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isChannel(value: unknown): value is BroadcastChannel {
  return value === "email" || value === "sms" || value === "both";
}

function isAudience(value: unknown): value is BroadcastAudience {
  return value === "all" || value === "admins" || value === "shift_leads";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "שיטת הבקשה אינה נתמכת." });
  }

  if (req.headers.get(IMPERSONATING_HEADER)?.trim() === "1") {
    return json(403, { error: "לא ניתן לשלוח תפוצה במצב צפייה כמשתמש." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "הגדרות השרת חסרות. פנו למנהל המערכת." });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json(400, { error: "גוף הבקשה אינו תקין." });
  }

  if (body.action !== "send" || !isChannel(body.channel) || !isAudience(body.audience)) {
    return json(400, { error: "פעולה לא מוכרת." });
  }

  const subject = trim(body.subject);
  const message = trim(body.body);
  const wantsEmail = body.channel !== "sms";
  const wantsSms = body.channel !== "email";

  if (wantsEmail && !subject) {
    return json(400, { error: "יש למלא נושא לדוא״ל." });
  }
  if (wantsEmail && subject.length > SUBJECT_MAX) {
    return json(400, { error: "הנושא ארוך מדי." });
  }
  if (!message) {
    return json(400, { error: "יש למלא את תוכן ההודעה." });
  }
  if (message.length > BODY_MAX) {
    return json(400, { error: "ההודעה ארוכה מדי." });
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

  let recipients: Recipient[];
  try {
    recipients = await loadRecipients(adminClient, body.audience);
  } catch {
    return json(500, { error: "טעינת הנמענים נכשלה. נסו שוב." });
  }
  const emailTargets = wantsEmail
    ? recipients.filter((row) => Boolean(row.email?.trim()))
    : [];
  const smsTargets = wantsSms
    ? recipients.filter((row) => toSopranoDestination(row.phone))
    : [];

  const reached = new Set<string>();
  for (const row of emailTargets) reached.add(row.id);
  for (const row of smsTargets) reached.add(row.id);

  if (reached.size === 0) {
    return json(400, { error: "אין נמענים לשליחה בקהל ובערוץ שנבחרו." });
  }

  let emailFailed = 0;
  let smsFailed = 0;

  if (wantsEmail) {
    const results = await mapPool(emailTargets, 4, (row) =>
      sendBroadcastEmail(row.email, row.full_name, subject, message),
    );
    emailFailed = results.filter((item) => !item.ok).length;
  }

  if (wantsSms) {
    const results = await mapPool(smsTargets, 4, (row) =>
      sendSopranoSms(toSopranoDestination(row.phone)!, message),
    );
    smsFailed = results.filter((item) => !item.ok).length;
  }

  const failedCount = emailFailed + smsFailed;
  const skippedNoPhone = wantsSms ? recipients.length - smsTargets.length : 0;
  const skippedNoEmail = wantsEmail ? recipients.length - emailTargets.length : 0;

  const { error: insertError } = await adminClient.from("unit_broadcasts").insert({
    sent_by: user.id,
    channel: body.channel,
    audience: body.audience,
    subject: wantsEmail ? subject : "",
    body: message,
    recipient_count: reached.size,
    skipped_no_phone: skippedNoPhone,
    skipped_no_email: skippedNoEmail,
    failed_count: failedCount,
  });

  if (insertError) {
    console.error("unit-broadcast: log insert failed", insertError);
  }

  if (failedCount > 0 && failedCount === emailTargets.length + smsTargets.length) {
    return json(502, { error: "השליחה נכשלה. בדקו את החיבור ונסו שוב." });
  }

  return json(200, {
    recipient_count: reached.size,
    skipped_no_phone: skippedNoPhone,
    skipped_no_email: skippedNoEmail,
    failed_count: failedCount,
  });
});

type Recipient = {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
};

async function loadRecipients(
  adminClient: SupabaseClient,
  audience: BroadcastAudience,
): Promise<Recipient[]> {
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("id, email, phone, full_name, active, invite_pending")
    .eq("active", true)
    .eq("invite_pending", false);

  if (error) {
    console.error("unit-broadcast: profiles", error);
    throw error;
  }

  const rows = (profiles ?? []) as Array<{
    id: string;
    email: string;
    phone: string | null;
    full_name: string;
  }>;

  if (audience === "all" || rows.length === 0) return rows;

  const role = audience === "admins" ? "admin" : "shift_lead";
  const { data: roleRows, error: roleError } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("role", role)
    .in(
      "user_id",
      rows.map((row) => row.id),
    );

  if (roleError) {
    console.error("unit-broadcast: roles", roleError);
    throw roleError;
  }

  const allowed = new Set((roleRows ?? []).map((row) => row.user_id as string));
  return rows.filter((row) => allowed.has(row.id));
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(worker))));
  }
  return results;
}

async function sendSopranoSms(
  destination972: string,
  message: string,
): Promise<{ ok: true } | { ok: false }> {
  const user = Deno.env.get("SOPRANO_USER");
  const password = Deno.env.get("SOPRANO_PASSWORD");
  const source = Deno.env.get("SOPRANO_SOURCE") || "YHPZ";
  if (!user || !password) {
    console.error("unit-broadcast: missing Soprano env");
    return { ok: false };
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
    if (!res.ok) {
      console.error("unit-broadcast: Soprano error", res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("unit-broadcast: Soprano exception", err);
    return { ok: false };
  }
}

async function sendBroadcastEmail(
  to: string,
  fullName: string,
  subject: string,
  message: string,
): Promise<{ ok: true } | { ok: false }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("unit-broadcast: missing Resend env");
    return { ok: false };
  }

  const greeting = fullName ? `שלום ${fullName},` : "שלום,";
  const text = ["אבן דרך", "יחפ״צ · היחידה הארצית לפינוי צירים", "", greeting, "", message].join(
    "\n",
  );
  const htmlBody = escapeHtml(message).replace(/\n/g, "<br>");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "אבן דרך - יחפ״צ <invites@send.yahpz.com>",
        to: [to],
        subject,
        text,
        html: `
        <div dir="rtl" lang="he" style="margin:0;padding:0;background:#F6F8FA;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FA;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #DDE4EB;">
                  <tr>
                    <td style="background:#182A47;padding:20px 24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#F2F6FA;">אבן דרך</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#DDE4EB;margin-top:4px;">יחפ״צ · היחידה הארצית לפינוי צירים</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#0F1B2D;text-align:right;">
                      <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
                      <p style="margin:0;">${htmlBody}</p>
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
      console.error("unit-broadcast: Resend error", response.status, await response.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("unit-broadcast: Resend exception", err);
    return { ok: false };
  }
}
