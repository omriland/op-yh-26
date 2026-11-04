import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import {
  SCRIBE_LANGUAGE_CODE,
  SCRIBE_MODEL_ID,
  hasFeedbackTranscript,
  transcriptFromScribeResponse,
  transcriptRequestDecision,
  transcriptionFailureMessage,
} from "../_shared/feedbackTranscript.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-impersonating";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FeedbackAudioRow = {
  id: string;
  audio_storage_path: string | null;
  audio_mime_type: string | null;
  transcript: string | null;
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);
  return runWithCors(corsHeaders, async () => {
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
      return json(500, { error: transcriptionFailureMessage(null) });
    }

    let id = "";
    try {
      const body = (await req.json()) as { id?: unknown };
      id = typeof body.id === "string" ? body.id.trim() : "";
    } catch {
      return json(400, { error: "גוף הבקשה אינו תקין." });
    }
    if (!UUID_RE.test(id)) {
      return json(400, { error: "גוף הבקשה אינו תקין." });
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
    const hasUser = !userError && Boolean(user);
    let isSuperAdmin = false;
    if (user) {
      const { data, error: roleError } = await adminClient.rpc("has_role", {
        uid: user.id,
        r: "super_admin",
      });
      isSuperAdmin = !roleError && Boolean(data);
    }
    const decision = transcriptRequestDecision({ hasUser, isSuperAdmin });
    if (decision.status === 401) {
      return json(401, { error: "יש להתחבר מחדש." });
    }
    if (decision.status === 403) {
      return json(403, { error: "אין לך הרשאה לפעולה זו." });
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("transcribe-feedback: missing ELEVENLABS_API_KEY");
      return json(500, { error: transcriptionFailureMessage(null) });
    }

    const { data: row, error: loadError } = await adminClient
      .from("user_feedback")
      .select("id, audio_storage_path, audio_mime_type, transcript")
      .eq("id", id)
      .maybeSingle();
    if (loadError) {
      console.error("transcribe-feedback: load", loadError.code);
      return json(500, { error: transcriptionFailureMessage(null) });
    }
    if (!row) {
      return json(404, { error: "המשוב לא נמצא." });
    }

    const feedback = row as FeedbackAudioRow;
    if (hasFeedbackTranscript(feedback.transcript)) {
      return json(200, { ok: true, transcript: feedback.transcript!.trim(), already: true });
    }
    if (!feedback.audio_storage_path) {
      return json(400, { error: "אין הקלטה לתמלול." });
    }

    const { data: file, error: downloadError } = await adminClient.storage
      .from("user-feedback")
      .download(feedback.audio_storage_path);
    if (downloadError || !file) {
      console.error("transcribe-feedback: download", downloadError?.message ?? "empty");
      return json(500, { error: transcriptionFailureMessage(null) });
    }

    const fileName = feedback.audio_storage_path.split("/").pop() || "note.m4a";
    const mime = feedback.audio_mime_type || "audio/mp4";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), fileName);
    form.append("model_id", SCRIBE_MODEL_ID);
    form.append("language_code", SCRIBE_LANGUAGE_CODE);
    form.append("timestamps_granularity", "none");
    form.append("tag_audio_events", "false");

    let upstream: Response;
    try {
      upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      console.error("transcribe-feedback: fetch", err instanceof Error ? err.name : "error");
      return json(502, { error: transcriptionFailureMessage(null) });
    }

    let payload: unknown = null;
    try {
      payload = await upstream.json();
    } catch {
      payload = null;
    }
    if (!upstream.ok) {
      console.error("transcribe-feedback: elevenlabs", upstream.status);
      return json(502, { error: transcriptionFailureMessage(upstream.status) });
    }

    const text = transcriptFromScribeResponse(payload);
    if (!text) {
      console.error("transcribe-feedback: empty transcript");
      return json(502, { error: transcriptionFailureMessage(null) });
    }

    const { data: updated, error: updateError } = await adminClient
      .from("user_feedback")
      .update({ transcript: text, transcribed_at: new Date().toISOString() })
      .eq("id", id)
      .is("transcript", null)
      .select("transcript");
    if (updateError) {
      console.error("transcribe-feedback: update", updateError.code);
      return json(500, { error: transcriptionFailureMessage(null) });
    }
    const written = Array.isArray(updated) ? updated[0] : null;
    if (written?.transcript) {
      return json(200, { ok: true, transcript: written.transcript });
    }

    const { data: current } = await adminClient
      .from("user_feedback")
      .select("transcript")
      .eq("id", id)
      .maybeSingle();
    if (hasFeedbackTranscript(current?.transcript)) {
      return json(200, { ok: true, transcript: current!.transcript.trim(), already: true });
    }
    return json(500, { error: transcriptionFailureMessage(null) });
  });
});
