import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import { LEGACY_HIT_TYPE_LABELS } from "../_shared/legacyHitTypes.ts";
import {
  SMART_SEARCH_MAX_QUERY_CHARS,
  smartSearchJsonSchema,
} from "../_shared/smartSearchFilter.ts";
import type { SmartSearchVocab } from "../_shared/smartSearchFilter.ts";
import { claudeRequestBody, parseClaudeFilter } from "../_shared/smartSearchClaude.ts";
import { buildSmartSearchPrompt, jerusalemToday } from "../_shared/smartSearchPrompt.ts";

/**
 * Sentence search for any signed-in user: turns a sentence into a validated filter
 * with Claude Haiku 5.5. Sends the model only the sentence, today's date and the
 * closed lists (event types, districts, damage locations). Never reads unit data,
 * so the filter cannot reveal anything; the app runs it through RLS.
 *
 * Secret: ANTHROPIC_API_KEY.
 */

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
const MODEL_TIMEOUT_MS = 5000;
const VOCAB_TTL_MS = 10 * 60 * 1000;
/** Model calls per user per minute. Each costs well under a tenth of a cent. */
const PARSES_PER_MINUTE = 20;

let vocabCache: { at: number; vocab: SmartSearchVocab } | null = null;

type Reason = "not_configured" | "rate_limited" | "timeout" | "model_error" | "refusal" | "invalid_output";

/** Logging must not break search; a missing migration only loses the row. */
async function logParse(
  userClient: SupabaseClient,
  q: string,
  filter: unknown,
  lane: "ai" | "fallback",
  latencyMs: number,
  reason: Reason | null,
): Promise<string | null> {
  const { data, error } = await userClient.rpc("app_search_log", {
    p_query: q,
    p_filter: filter ?? {},
    p_lane: lane,
    p_latency_ms: latencyMs,
    p_reason: reason,
  });
  if (error) {
    console.error("smart-search log failed", error.message);
    return null;
  }
  return typeof data === "string" ? data : null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return runWithCors(corsHeaders, async () => {
    if (req.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(503, { error: "not_configured" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "unauthorized" });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json(401, { error: "unauthorized" });
    }

    let q = "";
    try {
      const body = (await req.json()) as { q?: unknown };
      q = typeof body.q === "string" ? body.q.trim() : "";
    } catch {
      return json(400, { error: "invalid_body" });
    }
    if (!q) return json(400, { error: "invalid_body" });
    if (q.length > SMART_SEARCH_MAX_QUERY_CHARS) {
      return json(400, { error: "query_too_long" });
    }

    const started = Date.now();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      const logId = await logParse(userClient, q, {}, "fallback", 0, "not_configured");
      return json(503, { error: "not_configured", logId });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Parse attempts are logged as ai or fallback, so the log is the counter.
    const { count, error: countError } = await adminClient
      .from("smart_search_log")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", user.id)
      .in("lane", ["ai", "fallback"])
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if (countError) console.error("smart-search rate check", countError.message);
    else if ((count ?? 0) >= PARSES_PER_MINUTE) {
      return json(429, { error: "rate_limited" });
    }

    if (!vocabCache || Date.now() - vocabCache.at > VOCAB_TTL_MS) {
      const [types, districts] = await Promise.all([
        adminClient.from("event_types").select("name").eq("active", true),
        adminClient.from("districts").select("name").eq("active", true),
      ]);
      if (types.error || districts.error) {
        console.error("smart-search vocab", types.error ?? districts.error);
        return json(502, { error: "model_error" });
      }
      vocabCache = {
        at: Date.now(),
        vocab: {
          eventTypes: (types.data ?? []).map((r: { name: string }) => r.name),
          districts: (districts.data ?? []).map((r: { name: string }) => r.name),
          hitTypes: [...LEGACY_HIT_TYPE_LABELS],
        },
      };
    }
    const vocab = vocabCache.vocab;

    const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: 0 });
    let reply: Anthropic.Message;
    try {
      reply = await client.messages.create(claudeRequestBody(
        buildSmartSearchPrompt(q, jerusalemToday(new Date()), vocab),
        smartSearchJsonSchema(vocab),
      ));
    } catch (err) {
      const reason: Reason = err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "model_error";
      if (err instanceof Anthropic.APIError) {
        console.error("smart-search model status", err.status);
      } else if (reason === "model_error") {
        console.error("smart-search model call failed");
      }
      const logId = await logParse(userClient, q, {}, "fallback", Date.now() - started, reason);
      return json(reason === "timeout" ? 504 : 502, { error: reason, logId });
    }

    const parsed = parseClaudeFilter(reply, vocab);
    if ("error" in parsed) {
      const logId = await logParse(userClient, q, {}, "fallback", Date.now() - started, parsed.error);
      return json(502, { error: parsed.error, logId });
    }

    const logId = await logParse(userClient, q, parsed.filter, "ai", Date.now() - started, null);
    return json(200, { filter: parsed.filter, logId });
  });
});
