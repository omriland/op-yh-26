import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";

type StartBody = { action: "start"; event_responder_ids: string[] };
type StopBody = { action: "stop"; event_responder_ids: string[] };
type LoadBody = { action: "load"; track_token: string };
type PingBody = {
  action: "ping";
  track_token: string;
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  recorded_at?: string;
};

type RequestBody = StartBody | StopBody | LoadBody | PingBody;

const TRACK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SOPRANO_API_URL = "https://sec.soprano.co.il/";
const IMPERSONATING_HEADER = "x-yahpaz-impersonating";
const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-impersonating";

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

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomTrackToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function appOrigin(): string {
  const raw = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";
  try {
    const url = new URL(raw);
    return `${url.origin}/`;
  } catch {
    return "https://yahpz.com/";
  }
}

function buildTrackLink(token: string): string {
  const url = new URL(appOrigin());
  url.searchParams.set("track_token", token);
  return url.toString();
}

function buildTrackSms(trackUrl: string): string {
  return [
    `שובצת לאירוע ביחפצ - לשיתוף מיקום בזמן אמת לחץ על הלינק: ${trackUrl}`,
    "השאירו את הדף פתוח עד סיום האירוע.",
  ].join("\n");
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(trim).filter(Boolean))];
}

function smsAllowlist(): "all" | Set<string> {
  const raw = (Deno.env.get("LIVE_TRACK_SMS_ALLOWLIST") ?? "336").trim();
  if (raw === "*") return "all";
  return new Set(raw.split(",").map((part) => part.trim()).filter(Boolean));
}

function callsignAllowed(callsign: string | null | undefined): boolean {
  const allow = smsAllowlist();
  if (allow === "all") return true;
  const cs = callsign?.trim();
  return Boolean(cs && allow.has(cs));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function sendSopranoSms(destination972: string, message: string): Promise<boolean> {
  const user = Deno.env.get("SOPRANO_USER");
  const password = Deno.env.get("SOPRANO_PASSWORD");
  const source = Deno.env.get("SOPRANO_SOURCE") || "YHPZ";
  if (!user || !password) {
    console.error("responder-track: missing Soprano env");
    return false;
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
      console.error("responder-track: Soprano error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("responder-track: Soprano exception", err);
    return false;
  }
}

async function requireLead(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  adminClient: SupabaseClient,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return { ok: false, status: 401, error: "יש להתחבר מחדש." };
  }
  const [{ data: isAdmin }, { data: isLead }] = await Promise.all([
    adminClient.rpc("has_role", { uid: user.id, r: "admin" }),
    adminClient.rpc("has_role", { uid: user.id, r: "shift_lead" }),
  ]);
  if (!isAdmin && !isLead) {
    return { ok: false, status: 403, error: "אין לך הרשאה לפעולה זו." };
  }
  return { ok: true, userId: user.id };
}

async function findByToken(adminClient: SupabaseClient, token: string) {
  const hash = await sha256Hex(token);
  const { data, error } = await adminClient
    .from("event_responders")
    .select("id, ended_at, track_token_hash, track_token_expires_at")
    .eq("track_token_hash", hash)
    .maybeSingle();
  if (error) {
    return { error: "טעינת המעקב נכשלה." as const };
  }
  return { row: data as {
    id: string;
    ended_at: string | null;
    track_token_hash: string | null;
    track_token_expires_at: string | null;
  } | null };
}

function tokenCode(row: {
  ended_at: string | null;
  track_token_expires_at: string | null;
} | null): "invalid" | "expired" | "ended" | null {
  if (!row) return "invalid";
  if (!row.track_token_expires_at || new Date(row.track_token_expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  if (row.ended_at?.trim()) return "ended";
  return null;
}

function tokenErrorMessage(code: "invalid" | "expired" | "ended"): string {
  if (code === "ended") return "המעקב הסתיים.";
  return "קישור המעקב אינו תקין או שפג תוקפו.";
}

async function deleteLiveRow(adminClient: SupabaseClient, assignmentId: string) {
  await adminClient.from("event_responder_live_locations").delete().eq("event_responder_id", assignmentId);
}

async function handleStart(
  req: Request,
  adminClient: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  ids: string[],
) {
  const auth = await requireLead(req, supabaseUrl, anonKey, adminClient);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (req.headers.get(IMPERSONATING_HEADER)?.trim() === "1") {
    return json(200, { ok: true, sent: [], skipped: ids.map((id) => ({ id, reason: "impersonating" })) });
  }
  if (ids.length === 0) return json(400, { error: "חסר מזהה שיבוץ." });

  const { data: rows, error } = await adminClient
    .from("event_responders")
    .select(
      `id, ended_at, tracking_sms_sent_at, track_token_hash, track_token_expires_at,
       profile:profiles!responder_id(id, phone, active, callsign)`,
    )
    .in("id", ids);

  if (error) {
    return json(500, { error: "טעינת השיבוצים נכשלה." });
  }

  const sent: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let failed = false;

  for (const raw of rows ?? []) {
    const assignment = raw as {
      id: string;
      ended_at: string | null;
      tracking_sms_sent_at: string | null;
      track_token_hash: string | null;
      track_token_expires_at: string | null;
      profile: { id: string; phone: string | null; active: boolean; callsign: string | null } | null;
    };
    if (assignment.ended_at?.trim()) {
      skipped.push({ id: assignment.id, reason: "ended" });
      continue;
    }
    if (assignment.tracking_sms_sent_at) {
      skipped.push({ id: assignment.id, reason: "already_sent" });
      continue;
    }
    if (!callsignAllowed(assignment.profile?.callsign)) {
      skipped.push({ id: assignment.id, reason: "allowlist" });
      continue;
    }
    const phone = assignment.profile?.active ? assignment.profile.phone : null;
    const dest = toSopranoDestination(phone);
    if (!dest) {
      skipped.push({ id: assignment.id, reason: "no_phone" });
      continue;
    }

    const token = randomTrackToken();
    const hash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TRACK_TOKEN_TTL_MS).toISOString();
    const { error: mintError } = await adminClient
      .from("event_responders")
      .update({
        track_token_hash: hash,
        track_token_expires_at: expiresAt,
      })
      .eq("id", assignment.id);
    if (mintError) {
      failed = true;
      continue;
    }

    const ok = await sendSopranoSms(dest, buildTrackSms(buildTrackLink(token)));
    if (!ok) {
      await adminClient
        .from("event_responders")
        .update({ track_token_hash: null, track_token_expires_at: null })
        .eq("id", assignment.id);
      failed = true;
      continue;
    }

    const { error: markError } = await adminClient
      .from("event_responders")
      .update({ tracking_sms_sent_at: new Date().toISOString() })
      .eq("id", assignment.id);
    if (markError) {
      failed = true;
      continue;
    }
    sent.push(assignment.id);
  }

  if (failed && sent.length === 0) {
    return json(502, { error: "שליחת מעקב המיקום נכשלה. האירוע נשמר." });
  }
  return json(200, { ok: true, sent, skipped, failed: failed && sent.length > 0 });
}

async function handleStop(
  req: Request,
  adminClient: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  ids: string[],
) {
  const auth = await requireLead(req, supabaseUrl, anonKey, adminClient);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (ids.length === 0) return json(400, { error: "חסר מזהה שיבוץ." });

  await adminClient.from("event_responder_live_locations").delete().in("event_responder_id", ids);
  await adminClient
    .from("event_responders")
    .update({ track_token_hash: null, track_token_expires_at: null })
    .in("id", ids);

  return json(200, { ok: true, stopped: ids });
}

async function handleLoad(adminClient: SupabaseClient, token: string) {
  if (!token) return json(400, { error: "קישור המעקב אינו תקין או שפג תוקפו.", code: "invalid" });
  const found = await findByToken(adminClient, token);
  if ("error" in found) return json(500, { error: found.error, code: "invalid" });
  const code = tokenCode(found.row);
  if (code) {
    if (code === "ended" && found.row) await deleteLiveRow(adminClient, found.row.id);
    return json(code === "ended" ? 409 : 400, { error: tokenErrorMessage(code), code });
  }
  return json(200, { ok: true });
}

async function handlePing(adminClient: SupabaseClient, body: PingBody) {
  const token = trim(body.track_token);
  if (!token) return json(400, { error: "קישור המעקב אינו תקין או שפג תוקפו.", code: "invalid" });
  if (!isFiniteNumber(body.lat) || !isFiniteNumber(body.lng)) {
    return json(400, { error: "מיקום לא תקין.", code: "invalid" });
  }
  if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
    return json(400, { error: "מיקום לא תקין.", code: "invalid" });
  }

  const found = await findByToken(adminClient, token);
  if ("error" in found) return json(500, { error: found.error, code: "invalid" });
  if (!found.row) {
    return json(409, { error: tokenErrorMessage("ended"), code: "ended" });
  }
  const code = tokenCode(found.row);
  if (code) {
    await deleteLiveRow(adminClient, found.row.id);
    return json(code === "ended" ? 409 : 400, { error: tokenErrorMessage(code), code });
  }
  const assignmentId = found.row!.id;
  const recordedAt = trim(body.recorded_at) || new Date().toISOString();
  const accuracy = isFiniteNumber(body.accuracy_m) ? body.accuracy_m : null;

  const { error } = await adminClient.from("event_responder_live_locations").upsert({
    event_responder_id: assignmentId,
    lat: body.lat,
    lng: body.lng,
    accuracy_m: accuracy,
    recorded_at: recordedAt,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("responder-track: upsert failed", error);
    return json(500, { error: "שמירת המיקום נכשלה." });
  }
  return json(200, { ok: true });
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: "השרת אינו מוגדר במלואו." });
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json(400, { error: "בקשה לא תקינה." });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const action = (body as { action?: string }).action;

    if (action === "start") {
      return handleStart(req, adminClient, supabaseUrl, anonKey, idList((body as StartBody).event_responder_ids));
    }
    if (action === "stop") {
      return handleStop(req, adminClient, supabaseUrl, anonKey, idList((body as StopBody).event_responder_ids));
    }
    if (action === "load") {
      return handleLoad(adminClient, trim((body as LoadBody).track_token));
    }
    if (action === "ping") {
      return handlePing(adminClient, body as PingBody);
    }
    return json(400, { error: "פעולה לא נתמכת." });
  });
});
