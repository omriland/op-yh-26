import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import {
  PLATE_SCAN_DEFAULT_MODEL,
  bytesToBase64,
  parsePlateScanResponse,
  plateScanRequestBody,
} from "../_shared/plateScan.ts";

/**
 * Suggests licence plates seen in one event photo the caller just uploaded.
 * Reads the photo with the caller's own JWT, so storage and event_media RLS decide access.
 * Photos only (no videos). Sends OpenAI the image and a fixed prompt, nothing else.
 */

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
const OPENAI_TIMEOUT_MS = 15000;
/** Photos are compressed in the browser; anything bigger was not uploaded by the app. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("PLATE_SCAN_MODEL") || PLATE_SCAN_DEFAULT_MODEL;
    if (!supabaseUrl || !anonKey || !openAiKey) {
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

    let mediaId = "";
    try {
      const body = (await req.json()) as { media_id?: unknown };
      mediaId = typeof body.media_id === "string" ? body.media_id.trim() : "";
    } catch {
      return json(400, { error: "invalid_body" });
    }
    if (!UUID_RE.test(mediaId)) return json(400, { error: "invalid_body" });

    // Only the uploader's own photo: this is not a general-purpose OCR endpoint.
    const { data: media, error: mediaError } = await userClient
      .from("event_media")
      .select("storage_path, mime_type, uploaded_by")
      .eq("id", mediaId)
      .maybeSingle();
    if (mediaError || !media || media.uploaded_by !== user.id) {
      return json(404, { error: "not_found" });
    }
    if (typeof media.mime_type !== "string" || !media.mime_type.startsWith("image/")) {
      return json(200, { plates: [] });
    }

    const { data: file, error: fileError } = await userClient.storage
      .from("event-media")
      .download(media.storage_path);
    if (fileError || !file) {
      return json(404, { error: "not_found" });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return json(200, { plates: [] });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dataUrl = `data:${media.mime_type};base64,${bytesToBase64(bytes)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    let responseJson: unknown;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify(plateScanRequestBody(model, dataUrl)),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error("plate-scan openai status", res.status);
        return json(502, { error: "model_error" });
      }
      responseJson = await res.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return json(504, { error: "timeout" });
      }
      console.error("plate-scan openai fetch failed");
      return json(502, { error: "model_error" });
    } finally {
      clearTimeout(timer);
    }

    return json(200, { plates: parsePlateScanResponse(responseJson) });
  });
});
