import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildCorsHeaders,
  jsonResponse,
  runWithCors,
} from "../_shared/cors.ts";
import { verifyPrivacyPageToken } from "../_shared/privacyPageToken.ts";

/**
 * Confirms an Android-minted /privacy?t= HMAC. Bare /privacy stays login-gated.
 * JWT optional (anon / signed-in). Authorization is the HMAC, not the caller.
 */

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return runWithCors(corsHeaders, async () => {
    if (req.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }

    const secret = Deno.env.get("PRIVACY_PAGE_SECRET")?.trim() ?? "";
    if (!secret) {
      return jsonResponse(500, { ok: false, error: "not_configured" });
    }

    let token = "";
    try {
      const body = (await req.json()) as { token?: unknown };
      token = typeof body.token === "string" ? body.token : "";
    } catch {
      return jsonResponse(200, { ok: false });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const ok = await verifyPrivacyPageToken(secret, token, nowSec);
    return jsonResponse(200, { ok });
  });
});
