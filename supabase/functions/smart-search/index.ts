import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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
import { openAiRequestBody, parseOpenAiFilter } from "../_shared/smartSearchOpenAi.ts";
import { buildSmartSearchMessages, jerusalemToday } from "../_shared/smartSearchPrompt.ts";

/**
 * Admin smart search: turns a sentence into a validated filter via OpenAI.
 * Sends the model only the sentence, today's date and name lists. Never reads unit data.
 */

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
const OPENAI_TIMEOUT_MS = 5000;
const VOCAB_TTL_MS = 10 * 60 * 1000;

let vocabCache: { at: number; vocab: SmartSearchVocab } | null = null;

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
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("SMART_SEARCH_MODEL");
    if (!supabaseUrl || !anonKey || !serviceKey || !openAiKey || !model) {
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

    const adminClient = createClient(supabaseUrl, serviceKey);
    let allowed = false;
    for (const r of ["admin", "super_admin"]) {
      const { data, error } = await adminClient.rpc("has_role", { uid: user.id, r });
      if (!error && data) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return json(403, { error: "forbidden" });
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

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    let responseJson: unknown;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify(openAiRequestBody(
          model,
          buildSmartSearchMessages(q, jerusalemToday(new Date()), vocab),
          smartSearchJsonSchema(vocab),
        )),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error("smart-search openai status", res.status);
        return json(502, { error: "model_error" });
      }
      responseJson = await res.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return json(504, { error: "timeout" });
      }
      console.error("smart-search openai fetch failed");
      return json(502, { error: "model_error" });
    } finally {
      clearTimeout(timer);
    }

    const filter = parseOpenAiFilter(responseJson, vocab);
    if (!filter) return json(502, { error: "model_error" });

    // Logging must not break search.
    let logId: string | null = null;
    const { data: logged, error: logError } = await userClient.rpc("log_smart_search", {
      p_query: q,
      p_filter: filter,
      p_lane: "ai",
      p_latency_ms: Date.now() - started,
    });
    if (logError) console.error("smart-search log failed", logError.message);
    else logId = typeof logged === "string" ? logged : null;

    return json(200, { filter, logId });
  });
});
