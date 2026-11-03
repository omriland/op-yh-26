// A signed-in member deletes their own account (App Store guideline 5.1.1(v)).
// Acts only on the caller (auth.getUser of their own token); takes no user id.
// Refuses a "view as" session, a super admin and the unit's last admin. The
// App Review demo account gets a simulated success and nothing is deleted.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import {
  type AdminClient,
  deleteUserAccount,
  isImpersonationSession,
  jwtSessionId,
} from "../_shared/deleteAccount.ts";

const IMPERSONATING_HEADER = "x-yahpaz-impersonating";
const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-impersonating";
const IMPERSONATING_ERROR = "לא ניתן למחוק חשבון במצב צפייה כמשתמש אחר.";

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
      return json(403, { error: IMPERSONATING_ERROR });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: "הגדרות השרת חסרות. פנו למנהל המערכת." });
    }

    let body: { confirm?: unknown };
    try {
      body = (await req.json()) as { confirm?: unknown };
    } catch {
      return json(400, { error: "גוף הבקשה אינו תקין." });
    }
    if (body.confirm !== true) {
      return json(400, { error: "חסר אישור למחיקת החשבון." });
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

    // Cast once: the shared module types only the client calls it makes.
    const adminClient = createClient(supabaseUrl, serviceKey) as unknown as AdminClient;
    if (await isImpersonationSession(adminClient, jwtSessionId(authHeader))) {
      return json(403, { error: IMPERSONATING_ERROR });
    }

    const result = await deleteUserAccount(adminClient, user.id);
    if (!result.ok) {
      return json(result.status, { error: result.error, code: result.code });
    }
    console.log("delete-account", result.status, user.id, "files_failed", result.filesFailed);
    return json(200, { ok: true, status: result.status });
  });
});
