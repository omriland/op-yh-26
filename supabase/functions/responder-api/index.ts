import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import { sha256Hex, randomTrackToken } from "../_shared/partnerCrypto.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-yahpaz-partner-token";
const GOV_RESOURCE = "053cea08-09bc-40ec-8f7a-156f0677aff3";
const MEDIA_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
const MEDIA_CAP = 20;
const JPEG_ONLY = "לא ניתן להעלות קובץ זה. בחרו תמונה.";
const JPEG_TOO_LARGE = "הקובץ גדול מדי. בחרו תמונה אחרת.";
/** Same leak-cap TTL as the SMS flow (responder-track). Not a trip-length cap — stop_live_track ends tracking explicitly. */
const TRACK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type JsonBody = Record<string, unknown>;
type FieldErrors = Record<string, string>;

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plateDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function pickDefaultVehiclePlate(
  vehicles: { plate: string; isDefault?: boolean }[],
  existingPlate?: string | null,
): string {
  const existing = plateDigits(existingPlate ?? "");
  if (existing && vehicles.some((vehicle) => vehicle.plate === existing)) {
    return existing;
  }
  const starred = vehicles.find((vehicle) => vehicle.isDefault)?.plate;
  if (starred) return starred;
  if (vehicles.length === 1) return vehicles[0]!.plate;
  return "";
}

function formatPlate(raw: string): string {
  const digits = plateDigits(raw);
  if (digits.length === 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  if (digits.length === 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return raw.trim();
}

function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (Number.isNaN(value)) return "invalid";
  return value;
}

function env(): { url: string; service: string } | null {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return null;
  return { url, service };
}

function partnerTokenFromRequest(req: Request): string {
  const custom = req.headers.get("x-yahpaz-partner-token")?.trim() ?? "";
  if (custom) return custom;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice("bearer ".length).trim();
    if (token.startsWith("ypat_")) return token;
  }
  return "";
}

type TokenUser = { userId: string; grantId: string };

async function resolveToken(
  admin: SupabaseClient,
  token: string,
): Promise<TokenUser | null> {
  if (!token.startsWith("ypat_")) return null;
  const hash = await sha256Hex(token);
  const { data } = await admin
    .from("oauth_access_tokens")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, active")
    .eq("id", data.user_id)
    .maybeSingle();
  if (!profile?.active) return null;
  return { userId: data.user_id as string, grantId: data.id as string };
}

function isOpenStandalone(row: {
  origin: string;
  isCancelled: boolean;
  participationStatus: string;
}): boolean {
  if (row.origin !== "manual") return false;
  if (row.isCancelled) return false;
  return row.participationStatus === "pending" || row.participationStatus === "in_progress";
}

type Draft = {
  vehicle_plate: string;
  odometer_start: string;
  odometer_end: string;
  route: string;
  treatment_detail: string;
  treatment_notes: string;
};

function validateDraft(draft: Draft, mode: "draft" | "complete", allowedPlates: string[]): FieldErrors {
  const errors: FieldErrors = {};
  const start = parseOptionalNumber(draft.odometer_start);
  const end = parseOptionalNumber(draft.odometer_end);
  const plate = plateDigits(draft.vehicle_plate);
  const allowed = new Set(allowedPlates.map(plateDigits).filter(Boolean));

  if (start === "invalid") errors.odometer_start = "מד אוץ התחלה חייב להיות מספר.";
  if (end === "invalid") errors.odometer_end = "מד אוץ סיום חייב להיות מספר.";

  if (mode === "complete") {
    if (!plate) errors.vehicle_plate = "יש לבחור רכב.";
    else if (allowed.size > 0 && !allowed.has(plate)) {
      errors.vehicle_plate = "יש לבחור רכב מהרשימה המקושרת למשתמש.";
    } else if (allowed.size === 0) {
      errors.vehicle_plate = "לא מקושר רכב למשתמש. פנו למנהל המערכת.";
    }
    if (start == null || start === "invalid") errors.odometer_start = "יש למלא מד אוץ התחלה.";
    if (end == null || end === "invalid") errors.odometer_end = "יש למלא מד אוץ סיום.";
    if (!draft.route.trim()) errors.route = "יש למלא נתיב נסיעה.";
    if (!draft.treatment_detail.trim()) errors.treatment_detail = "יש למלא פירוט הטיפול.";
  }

  if (
    !errors.odometer_end &&
    typeof start === "number" &&
    typeof end === "number" &&
    end <= start
  ) {
    errors.odometer_end = "מד אוץ סיום חייב להיות גדול ממד אוץ התחלה";
  }

  return errors;
}

function draftFromBody(raw: unknown, fallback: Draft): Draft {
  if (!raw || typeof raw !== "object") return fallback;
  const row = raw as Record<string, unknown>;
  return {
    vehicle_plate: typeof row.vehicle_plate === "string" ? row.vehicle_plate : fallback.vehicle_plate,
    odometer_start: typeof row.odometer_start === "string" ? row.odometer_start : fallback.odometer_start,
    odometer_end: typeof row.odometer_end === "string" ? row.odometer_end : fallback.odometer_end,
    route: typeof row.route === "string" ? row.route : fallback.route,
    treatment_detail:
      typeof row.treatment_detail === "string" ? row.treatment_detail : fallback.treatment_detail,
    treatment_notes:
      typeof row.treatment_notes === "string" ? row.treatment_notes : fallback.treatment_notes,
  };
}

type Assignment = {
  id: string;
  event_id: string;
  responder_id: string;
  status: string;
  vehicle_plate: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  route: string | null;
  treatment_detail: string | null;
  treatment_notes: string | null;
  total_km: number | null;
  event: {
    id: string;
    origin: string;
    status: string;
    is_cancelled: boolean;
    event_date: string;
    police_event_id: string | null;
    location: string | null;
    event_type: { name: string } | null;
    road: { name: string } | null;
    shift_lead: { full_name: string; callsign: string } | null;
  };
};

async function loadAssignment(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Assignment | null> {
  const { data } = await admin
    .from("event_responders")
    .select(
      `
      id, event_id, responder_id, status, vehicle_plate, odometer_start, odometer_end,
      route, treatment_detail, treatment_notes, total_km,
      event:events!inner(
        id, origin, status, is_cancelled, event_date, police_event_id, location,
        event_type:event_types(name),
        road:roads(name),
        shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign)
      )
    `,
    )
    .eq("event_id", eventId)
    .eq("responder_id", userId)
    .maybeSingle();
  if (!data) return null;
  const eventRaw = data.event as Assignment["event"] | Assignment["event"][] | null;
  const event = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw;
  if (!event) return null;
  return { ...(data as Omit<Assignment, "event">), event };
}

function standaloneOrError(assignment: Assignment, forWrite: boolean): Response | null {
  if (assignment.event.origin !== "manual") {
    return json(400, { error: "אירוע זה אינו זמין דרך ה-API.", code: "shift_born" });
  }
  if (forWrite && assignment.event.is_cancelled) {
    return json(400, { error: "האירוע בוטל.", code: "cancelled" });
  }
  if (forWrite && (assignment.status === "done" || assignment.event.status === "done")) {
    return json(400, {
      error: "לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך.",
      code: "locked",
    });
  }
  return null;
}

async function allowedPlates(
  admin: SupabaseClient,
  userId: string,
  existingPlate: string | null,
): Promise<string[]> {
  const { data: vehicles } = await admin
    .from("vehicles")
    .select("plate_number, archived")
    .eq("user_id", userId);
  const existing = existingPlate ? plateDigits(existingPlate) : "";
  return (vehicles ?? [])
    .map((v) => ({
      plate: plateDigits(String(v.plate_number ?? "")),
      archived: Boolean(v.archived),
    }))
    .filter((v) => v.plate && (!v.archived || v.plate === existing))
    .map((v) => v.plate);
}

async function lookupGov(plate: string): Promise<{
  model: string | null;
  color: string | null;
  manufacturer: string | null;
} | null> {
  const n = Number(plateDigits(plate));
  if (!n) return null;
  const params = new URLSearchParams({
    resource_id: GOV_RESOURCE,
    filters: JSON.stringify({ mispar_rechev: n }),
    fields: "tzeva_rechev,kinuy_mishari,tozeret_nm",
    limit: "1",
  });
  try {
    const res = await fetch(
      `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`,
    );
    const text = await res.text();
    if (!text.trimStart().startsWith("{")) return null;
    const parsed = JSON.parse(text) as {
      result?: {
        records?: Array<{
          tzeva_rechev?: unknown;
          kinuy_mishari?: unknown;
          tozeret_nm?: unknown;
        }>;
      };
    };
    const row = parsed.result?.records?.[0];
    if (!row) return null;
    const model = typeof row.kinuy_mishari === "string" ? row.kinuy_mishari.trim() : "";
    const color = typeof row.tzeva_rechev === "string" ? row.tzeva_rechev.trim() : "";
    const manufacturer = typeof row.tozeret_nm === "string" ? row.tozeret_nm.trim() : "";
    return {
      model: model || null,
      color: color || null,
      manufacturer: manufacturer || null,
    };
  } catch {
    return null;
  }
}

function decodeJpegBase64(raw: string): Uint8Array | null {
  const stripped = raw.replace(/^data:image\/jpeg;base64,/i, "").replace(/\s/g, "");
  try {
    const bin = atob(stripped);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);
  return runWithCors(corsHeaders, async () => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "שיטת הבקשה אינה נתמכת." });

    const cfg = env();
    if (!cfg) return json(500, { error: "השירות אינו מוגדר." });
    const admin = createClient(cfg.url, cfg.service);

    const token = partnerTokenFromRequest(req);
    const session = await resolveToken(admin, token);
    if (!session) {
      return json(401, { error: "החיבור פג או בוטל. יש לקשר מחדש.", code: "invalid_token" });
    }

    let body: JsonBody;
    try {
      body = (await req.json()) as JsonBody;
    } catch {
      return json(400, { error: "גוף הבקשה אינו תקין." });
    }

    const action = trim(body.action);
    if (action === "whoami") return handleWhoami(admin, session.userId);
    if (action === "list_open_events") return handleListOpen(admin, session.userId);
    if (action === "get_event") return handleGet(admin, session.userId, trim(body.event_id));
    if (action === "save_draft") {
      return handleSave(admin, session.userId, body, "draft");
    }
    if (action === "complete") {
      return handleSave(admin, session.userId, body, "complete");
    }
    if (action === "start_live_track") {
      return handleStartLiveTrack(admin, session.userId, trim(body.event_id));
    }
    if (action === "stop_live_track") {
      return handleStopLiveTrack(admin, session.userId, trim(body.event_id));
    }
    if (action === "add_treated_plate") {
      return handleAddPlate(admin, session.userId, body);
    }
    if (action === "remove_treated_plate") {
      return handleRemovePlate(admin, session.userId, body);
    }
    if (action === "lookup_treated_plate") {
      const hit = await lookupGov(trim(body.plate_number) || trim(body.plate));
      return json(200, { hit });
    }
    if (action === "list_media") {
      return handleListMedia(admin, session.userId, trim(body.event_id));
    }
    if (action === "upload_media") {
      return handleUploadMedia(admin, session.userId, body);
    }
    if (action === "update_media") {
      return handleUpdateMedia(admin, session.userId, body);
    }
    if (action === "delete_media") {
      return handleDeleteMedia(admin, session.userId, body);
    }

    return json(400, { error: "פעולה לא מוכרת." });
  });
});

async function handleWhoami(admin: SupabaseClient, userId: string): Promise<Response> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, callsign")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return json(401, { error: "יש להתחבר מחדש." });
  return json(200, {
    user_id: data.id,
    full_name: data.full_name,
    callsign: data.callsign,
  });
}

async function handleListOpen(admin: SupabaseClient, userId: string): Promise<Response> {
  const { data, error } = await admin
    .from("event_responders")
    .select(
      `
      id, status,
      event:events!inner(
        id, origin, is_cancelled, event_date, police_event_id, location, status,
        event_type:event_types(name),
        road:roads(name),
        shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign)
      )
    `,
    )
    .eq("responder_id", userId)
    .neq("status", "done");

  if (error) return json(400, { error: "לא ניתן לטעון אירועים." });

  const events = (data ?? []).flatMap((row) => {
    const eventRaw = row.event as
      | {
          id: string;
          origin: string;
          is_cancelled: boolean;
          event_date: string;
          police_event_id: string | null;
          location: string | null;
          status: string;
          event_type: { name: string } | null;
          road: { name: string } | null;
          shift_lead: { full_name: string; callsign: string } | null;
        }
      | {
          id: string;
          origin: string;
          is_cancelled: boolean;
          event_date: string;
          police_event_id: string | null;
          location: string | null;
          status: string;
          event_type: { name: string } | null;
          road: { name: string } | null;
          shift_lead: { full_name: string; callsign: string } | null;
        }[]
      | null;
    const event = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw;
    if (!event) return [];
    if (
      !isOpenStandalone({
        origin: event.origin,
        isCancelled: Boolean(event.is_cancelled),
        participationStatus: String(row.status),
      })
    ) {
      return [];
    }
    const lead = event.shift_lead;
    return [
      {
        event_id: event.id,
        assignment_id: row.id,
        participation_status: row.status,
        event_date: event.event_date,
        police_event_id: event.police_event_id,
        event_type_name: event.event_type?.name ?? null,
        road_name: event.road?.name ?? null,
        location: event.location,
        shift_lead_name: lead ? `${lead.full_name} · ${lead.callsign}` : null,
      },
    ];
  });

  events.sort((a, b) => (a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0));
  return json(200, { events });
}

async function eventPayload(admin: SupabaseClient, assignment: Assignment, userId: string) {
  const platesAllowed = await allowedPlates(admin, userId, assignment.vehicle_plate);
  const { data: vehicles } = await admin
    .from("vehicles")
    .select("plate_number, model, archived, is_default")
    .eq("user_id", userId);
  const existing = assignment.vehicle_plate ? plateDigits(assignment.vehicle_plate) : "";
  const vehicleMapped = (vehicles ?? [])
    .map((v) => ({
      plate: plateDigits(String(v.plate_number ?? "")),
      model: String(v.model ?? "").trim(),
      archived: Boolean(v.archived),
      isDefault: Boolean(v.is_default) && !v.archived,
    }))
    .filter((v) => v.plate && (!v.archived || v.plate === existing));
  const vehicleOptions = vehicleMapped.map(({ plate, model }) => ({ plate, model }));

  const { data: plates } = await admin
    .from("event_treated_plates")
    .select("id, plate_number, model, color, left_where, manufacturer, logo_slug, sort_order")
    .eq("event_responder_id", assignment.id)
    .order("sort_order");

  const media = await listMediaRows(admin, assignment.event_id);
  const lead = assignment.event.shift_lead;

  return {
    event_id: assignment.event_id,
    assignment_id: assignment.id,
    event_status: assignment.event.status,
    participation_status: assignment.status,
    event_date: assignment.event.event_date,
    police_event_id: assignment.event.police_event_id,
    event_type_name: assignment.event.event_type?.name ?? null,
    is_cancelled: assignment.event.is_cancelled,
    road_name: assignment.event.road?.name ?? null,
    location: assignment.event.location,
    shift_lead_name: lead ? `${lead.full_name} · ${lead.callsign}` : null,
    vehicles: vehicleOptions,
    allowed_plates: platesAllowed,
    draft: {
      vehicle_plate: pickDefaultVehiclePlate(
        vehicleMapped.map(({ plate, isDefault }) => ({ plate, isDefault })),
        existing,
      ),
      odometer_start: assignment.odometer_start != null ? String(assignment.odometer_start) : "",
      odometer_end: assignment.odometer_end != null ? String(assignment.odometer_end) : "",
      route: assignment.route ?? "",
      treatment_detail: assignment.treatment_detail ?? "",
      treatment_notes: assignment.treatment_notes ?? "",
    },
    treated_plates: plates ?? [],
    media,
  };
}

async function handleGet(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Response> {
  if (!eventId) return json(400, { error: "חסר מזהה אירוע." });
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  if (assignment.event.origin !== "manual") {
    return json(400, { error: "אירוע זה אינו זמין דרך ה-API.", code: "shift_born" });
  }
  return json(200, await eventPayload(admin, assignment, userId));
}

async function handleSave(
  admin: SupabaseClient,
  userId: string,
  body: JsonBody,
  mode: "draft" | "complete",
): Promise<Response> {
  const eventId = trim(body.event_id);
  if (!eventId) return json(400, { error: "חסר מזהה אירוע." });
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  const blocked = standaloneOrError(assignment, true);
  if (blocked) return blocked;

  const stored: Draft = {
    vehicle_plate: assignment.vehicle_plate ?? "",
    odometer_start: assignment.odometer_start != null ? String(assignment.odometer_start) : "",
    odometer_end: assignment.odometer_end != null ? String(assignment.odometer_end) : "",
    route: assignment.route ?? "",
    treatment_detail: assignment.treatment_detail ?? "",
    treatment_notes: assignment.treatment_notes ?? "",
  };
  const draft = draftFromBody(body.draft, stored);
  const plates = await allowedPlates(admin, userId, assignment.vehicle_plate);
  const fieldErrors = validateDraft(draft, mode, plates);
  if (Object.keys(fieldErrors).length > 0) {
    return json(400, {
      error:
        mode === "complete"
          ? "יש למלא את כל שדות החובה לפני סיום הדיווח."
          : "בדקו את השדות המסומנים.",
      fieldErrors,
    });
  }

  const start = parseOptionalNumber(draft.odometer_start);
  const end = parseOptionalNumber(draft.odometer_end);
  if (start === "invalid" || end === "invalid") {
    return json(400, { error: "קילומטרים חייבים להיות מספר." });
  }

  const nextStatus = mode === "complete" ? "done" : "in_progress";
  const { data: updated, error } = await admin
    .from("event_responders")
    .update({
      vehicle_plate: formatPlate(draft.vehicle_plate) || null,
      odometer_start: start,
      odometer_end: end,
      route: draft.route.trim() || null,
      treatment_detail: draft.treatment_detail.trim() || null,
      treatment_notes: draft.treatment_notes.trim() || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
  }

  const { data: eventStatus } = await admin.rpc("apply_event_status_from_participations", {
    p_event_id: assignment.event_id,
  });

  if (mode === "complete") {
    await stopLiveTracking(admin, assignment.id);
  }

  return json(200, {
    ok: true,
    eventStatus: eventStatus ?? null,
    participationStatus: nextStatus,
  });
}

/** Shared by stop_live_track and complete. Never throws — logs and continues, matching "cleanup failure must not fail complete". */
async function stopLiveTracking(admin: SupabaseClient, assignmentId: string): Promise<void> {
  const { error: deleteError } = await admin
    .from("event_responder_live_locations")
    .delete()
    .eq("event_responder_id", assignmentId);
  if (deleteError) {
    console.error("responder-api: stopLiveTracking delete failed", deleteError);
  }

  const { error: updateError } = await admin
    .from("event_responders")
    .update({ track_token_hash: null, track_token_expires_at: null })
    .eq("id", assignmentId);
  if (updateError) {
    console.error("responder-api: stopLiveTracking update failed", updateError);
  }
}

async function handleStartLiveTrack(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Response> {
  if (!eventId) return json(400, { error: "חסר מזהה אירוע." });
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  const blocked = standaloneOrError(assignment, true);
  if (blocked) return blocked;

  const token = randomTrackToken();
  const hash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + TRACK_TOKEN_TTL_MS).toISOString();
  const { error } = await admin
    .from("event_responders")
    .update({ track_token_hash: hash, track_token_expires_at: expiresAt })
    .eq("id", assignment.id);
  if (error) {
    return json(500, { error: "התחלת שיתוף המיקום נכשלה." });
  }
  return json(200, { ok: true, track_token: token, expires_at: expiresAt });
}

async function handleStopLiveTrack(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Response> {
  if (!eventId) return json(400, { error: "חסר מזהה אירוע." });
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  await stopLiveTracking(admin, assignment.id);
  return json(200, { ok: true });
}

async function handleAddPlate(
  admin: SupabaseClient,
  userId: string,
  body: JsonBody,
): Promise<Response> {
  const eventId = trim(body.event_id);
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  const blocked = standaloneOrError(assignment, true);
  if (blocked) return blocked;

  const digits = plateDigits(trim(body.plate_number) || trim(body.plate));
  if (digits.length < 5 || digits.length > 8) {
    return json(400, { error: "יש להזין 5 עד 8 ספרות.", fieldErrors: { treated_plates: "יש להזין 5 עד 8 ספרות." } });
  }

  const { data: existing } = await admin
    .from("event_treated_plates")
    .select("id, plate_number, sort_order")
    .eq("event_responder_id", assignment.id);
  if ((existing ?? []).some((row) => plateDigits(row.plate_number) === digits)) {
    return json(400, { error: "מספר זה כבר נוסף.", fieldErrors: { treated_plates: "מספר זה כבר נוסף." } });
  }

  const hit = await lookupGov(digits);
  const sortOrder = (existing ?? []).reduce((max, row) => Math.max(max, row.sort_order ?? 0), -1) + 1;
  const leftWhere = trim(body.left_where) || null;
  const { data, error } = await admin
    .from("event_treated_plates")
    .insert({
      event_responder_id: assignment.id,
      plate_number: formatPlate(digits),
      model: hit?.model ?? null,
      color: hit?.color ?? null,
      left_where: leftWhere,
      manufacturer: hit?.manufacturer ?? null,
      sort_order: sortOrder,
    })
    .select("id, plate_number, model, color, left_where, manufacturer, logo_slug, sort_order")
    .single();

  if (error || !data) {
    return json(400, { error: "שמירת הלוחית נכשלה." });
  }
  return json(200, { ok: true, plate: data });
}

async function handleRemovePlate(
  admin: SupabaseClient,
  userId: string,
  body: JsonBody,
): Promise<Response> {
  const eventId = trim(body.event_id);
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  const blocked = standaloneOrError(assignment, true);
  if (blocked) return blocked;

  const digits = plateDigits(trim(body.plate_number) || trim(body.plate));
  const { data: rows } = await admin
    .from("event_treated_plates")
    .select("id, plate_number")
    .eq("event_responder_id", assignment.id);
  const match = (rows ?? []).find((row) => plateDigits(row.plate_number) === digits);
  if (!match) return json(400, { error: "הלוחית לא נמצאה." });
  const { error } = await admin.from("event_treated_plates").delete().eq("id", match.id);
  if (error) return json(400, { error: "מחיקת הלוחית נכשלה." });
  return json(200, { ok: true });
}

async function listMediaRows(admin: SupabaseClient, eventId: string) {
  const { data } = await admin
    .from("event_media")
    .select(
      "id, event_id, uploaded_by, caption, taken_when, storage_path, mime_type, byte_size, width, height, created_at, plates:event_media_plates(treated_plate_id)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await admin.storage
        .from("event-media")
        .createSignedUrl(row.storage_path as string, 3600);
      const plates = row.plates as { treated_plate_id: string }[] | { treated_plate_id: string } | null;
      const plateRows = !plates ? [] : Array.isArray(plates) ? plates : [plates];
      return {
        id: row.id,
        uploaded_by: row.uploaded_by,
        caption: row.caption,
        taken_when: row.taken_when,
        byte_size: row.byte_size,
        width: row.width,
        height: row.height,
        created_at: row.created_at,
        treated_plate_ids: plateRows.map((p) => p.treated_plate_id),
        signed_url: signed?.signedUrl ?? null,
      };
    }),
  );
}

async function mediaAssignment(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
  forWrite: boolean,
): Promise<{ assignment: Assignment } | { response: Response }> {
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return {
      response: json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." }),
    };
  }
  if (assignment.event.origin !== "manual") {
    return { response: json(400, { error: "אירוע זה אינו זמין דרך ה-API.", code: "shift_born" }) };
  }
  if (forWrite && assignment.event.is_cancelled) {
    return { response: json(400, { error: "האירוע בוטל.", code: "cancelled" }) };
  }
  return { assignment };
}

async function handleListMedia(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Response> {
  const loaded = await mediaAssignment(admin, userId, eventId, false);
  if ("response" in loaded) return loaded.response;
  return json(200, { media: await listMediaRows(admin, loaded.assignment.event_id) });
}

async function handleUploadMedia(
  admin: SupabaseClient,
  userId: string,
  body: JsonBody,
): Promise<Response> {
  const loaded = await mediaAssignment(admin, userId, trim(body.event_id), true);
  if ("response" in loaded) return loaded.response;
  const assignment = loaded.assignment;

  const takenWhen = trim(body.taken_when);
  if (takenWhen !== "before_treatment" && takenWhen !== "during_after_treatment") {
    return json(400, { error: "יש לבחור מתי צולמה התמונה.", fieldErrors: { event_media: "יש לבחור מתי צולמה התמונה." } });
  }
  const caption = trim(body.caption) || null;
  if (caption && caption.length > 200) {
    return json(400, { error: "התיאור קצר עד 200 תווים." });
  }

  const { count } = await admin
    .from("event_media")
    .select("id", { count: "exact", head: true })
    .eq("event_id", assignment.event_id);
  if ((count ?? 0) >= MEDIA_CAP) {
    return json(400, { error: "ניתן לצרף עד 20 תמונות לאירוע." });
  }

  const jpeg = decodeJpegBase64(trim(body.image_base64));
  if (!jpeg) return json(400, { error: JPEG_ONLY });
  if (jpeg.byteLength > MEDIA_MAX_BYTES) return json(400, { error: JPEG_TOO_LARGE });

  const id = crypto.randomUUID();
  const storagePath = `${assignment.event_id}/${id}.jpg`;
  const { error: uploadError } = await admin.storage
    .from("event-media")
    .upload(storagePath, jpeg, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    return json(400, { error: "ההעלאה נכשלה. נסו שוב." });
  }

  const { error: insertError } = await admin.from("event_media").insert({
    id,
    event_id: assignment.event_id,
    uploaded_by: userId,
    caption,
    taken_when: takenWhen,
    storage_path: storagePath,
    mime_type: "image/jpeg",
    byte_size: jpeg.byteLength,
  });
  if (insertError) {
    await admin.storage.from("event-media").remove([storagePath]);
    return json(400, { error: "ההעלאה נכשלה. נסו שוב." });
  }

  const plateIds = Array.isArray(body.treated_plate_ids)
    ? body.treated_plate_ids.filter((id): id is string => typeof id === "string" && Boolean(id))
    : [];
  if (plateIds.length > 0) {
    const { error: plateError } = await admin.from("event_media_plates").insert(
      plateIds.map((treated_plate_id) => ({ media_id: id, treated_plate_id })),
    );
    if (plateError) {
      await admin.from("event_media").delete().eq("id", id);
      await admin.storage.from("event-media").remove([storagePath]);
      return json(400, { error: "ההעלאה נכשלה. נסו שוב." });
    }
  }

  const media = await listMediaRows(admin, assignment.event_id);
  return json(200, { ok: true, media: media.find((row) => row.id === id) ?? null });
}

async function handleUpdateMedia(
  admin: SupabaseClient,
  userId: string,
  body: JsonBody,
): Promise<Response> {
  const mediaId = trim(body.media_id);
  const { data: row } = await admin
    .from("event_media")
    .select("id, event_id, uploaded_by")
    .eq("id", mediaId)
    .maybeSingle();
  if (!row || row.uploaded_by !== userId) {
    return json(404, { error: "התמונה לא נמצאה." });
  }
  const loaded = await mediaAssignment(admin, userId, row.event_id as string, true);
  if ("response" in loaded) return loaded.response;

  const takenWhen = trim(body.taken_when);
  if (takenWhen !== "before_treatment" && takenWhen !== "during_after_treatment") {
    return json(400, { error: "יש לבחור מתי צולמה התמונה." });
  }
  const caption = trim(body.caption) || null;
  if (caption && caption.length > 200) {
    return json(400, { error: "התיאור קצר עד 200 תווים." });
  }

  const { error } = await admin
    .from("event_media")
    .update({ taken_when: takenWhen, caption })
    .eq("id", mediaId);
  if (error) return json(400, { error: "עדכון התמונה נכשל." });

  if (Array.isArray(body.treated_plate_ids)) {
    await admin.from("event_media_plates").delete().eq("media_id", mediaId);
    const plateIds = body.treated_plate_ids.filter(
      (id): id is string => typeof id === "string" && Boolean(id),
    );
    if (plateIds.length > 0) {
      const { error: plateError } = await admin.from("event_media_plates").insert(
        plateIds.map((treated_plate_id) => ({ media_id: mediaId, treated_plate_id })),
      );
      if (plateError) return json(400, { error: "עדכון התמונה נכשל." });
    }
  }

  return json(200, { ok: true });
}

async function handleDeleteMedia(
  admin: SupabaseClient,
  userId: string,
  body: JsonBody,
): Promise<Response> {
  const mediaId = trim(body.media_id);
  const { data: row } = await admin
    .from("event_media")
    .select("id, event_id, uploaded_by, storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (!row || row.uploaded_by !== userId) {
    return json(404, { error: "התמונה לא נמצאה." });
  }
  const loaded = await mediaAssignment(admin, userId, row.event_id as string, true);
  if ("response" in loaded) return loaded.response;

  const { error } = await admin.from("event_media").delete().eq("id", mediaId);
  if (error) return json(400, { error: "מחיקת התמונה נכשלה." });
  await admin.storage.from("event-media").remove([row.storage_path as string]);
  return json(200, { ok: true });
}
