import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { htmlToText, sendTransactionalEmail } from "../_shared/email.ts";

type SendBody = {
  user_id: string;
  subject: string;
  html: string;
  text?: string;
  idempotency_key?: string;
};

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

  const token = authHeader.slice("Bearer ".length).trim();
  const adminClient = createClient(supabaseUrl, serviceKey);

  const isService = token === serviceKey;
  if (!isService) {
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
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return json(400, { error: "גוף הבקשה אינו תקין." });
  }

  const userId = trim(body.user_id);
  const subject = trim(body.subject);
  const html = typeof body.html === "string" ? body.html.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const idempotencyKey = trim(body.idempotency_key) || undefined;

  if (!userId || !subject || !html) {
    return json(400, { error: "יש לספק משתמש, נושא ותוכן HTML." });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, active, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return json(500, { error: "טעינת המשתמש נכשלה." });
  }
  if (!profile || profile.active !== true) {
    return json(400, { error: "המשתמש אינו פעיל או לא נמצא." });
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userId);
  const email = authData.user?.email?.trim().toLowerCase() ?? "";
  if (authError || !email) {
    return json(400, { error: "לא נמצאה כתובת דוא״ל למשתמש." });
  }

  const result = await sendTransactionalEmail({
    to: email,
    subject,
    htmlInner: html,
    textInner: text || htmlToText(html),
    idempotencyKey,
  });

  if (!result.ok) {
    return json(400, { error: result.error, detail: result.detail });
  }

  return json(200, { id: result.id });
});
