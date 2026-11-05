import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import { markFeedbackTreated } from "../_shared/feedbackMarkTreated.ts";

const SOPRANO_API_URL = "https://sec.soprano.co.il/";
const IMPERSONATING_HEADER = "x-yahpaz-impersonating";
const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-impersonating";

type MarkTreatedBody = {
  action: "mark_treated";
  id: string;
};

type AuthorRow = {
  full_name: string | null;
  phone: string | null;
};

type FeedbackRow = {
  id: string;
  title: string | null;
  body: string | null;
  status: "open" | "in_progress" | "fixed" | "wont_do";
  audio_storage_path: string | null;
  author: AuthorRow | AuthorRow[] | null;
};

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

function authorFrom(row: FeedbackRow): AuthorRow {
  const author = row.author;
  if (!author) return { full_name: null, phone: null };
  return Array.isArray(author) ? author[0] ?? { full_name: null, phone: null } : author;
}

async function sendSopranoSms(
  destination972: string,
  message: string,
): Promise<{ ok: true } | { ok: false }> {
  const user = Deno.env.get("SOPRANO_USER");
  const password = Deno.env.get("SOPRANO_PASSWORD");
  const source = Deno.env.get("SOPRANO_SOURCE") || "YHPZ";
  if (!user || !password) {
    console.error("user-feedback: missing Soprano env");
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
      console.error("user-feedback: Soprano error", res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("user-feedback: Soprano exception", err);
    return { ok: false };
  }
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

    if (req.headers.get(IMPERSONATING_HEADER)?.trim() === "1") {
      return json(403, { error: "לא ניתן לשלוח SMS במצב צפייה כמשתמש." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: "הגדרות השרת חסרות. פנו למנהל המערכת." });
    }

    let body: MarkTreatedBody;
    try {
      body = (await req.json()) as MarkTreatedBody;
    } catch {
      return json(400, { error: "גוף הבקשה אינו תקין." });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (body.action !== "mark_treated" || !id) {
      return json(400, { error: "פעולה לא מוכרת." });
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

    const { data: isSuperAdmin, error: roleError } = await adminClient.rpc("has_role", {
      uid: user.id,
      r: "super_admin",
    });

    if (roleError || !isSuperAdmin) {
      return json(403, { error: "אין לך הרשאה לפעולה זו." });
    }

    const { data: row, error: loadError } = await adminClient
      .from("user_feedback")
      .select(
        "id, title, body, status, audio_storage_path, author:profiles!user_feedback_user_id_fkey(full_name, phone)",
      )
      .eq("id", id)
      .maybeSingle();

    if (loadError) {
      console.error("user-feedback: load", loadError);
      return json(500, { error: "טעינת המשוב נכשלה. נסו שוב." });
    }
    if (!row) {
      return json(404, { error: "המשוב לא נמצא." });
    }

    const feedback = row as FeedbackRow;
    const result = await markFeedbackTreated(
      { ...feedback, author: authorFrom(feedback) },
      {
        setFixed: async () => {
          const { error: updateError } = await adminClient
            .from("user_feedback")
            .update({ status: "fixed" })
            .eq("id", id);
          if (updateError) console.error("user-feedback: update", updateError);
          return !updateError;
        },
        smsDestination: toSopranoDestination,
        sendSms: async (destination, message) =>
          (await sendSopranoSms(destination, message)).ok,
      },
    );
    if (!result.ok) {
      return json(500, { error: "עדכון הסטטוס נכשל. נסו שוב." });
    }
    return json(200, { ok: true, sms: result.sms });
  });
});
