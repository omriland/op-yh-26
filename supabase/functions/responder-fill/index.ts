import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import { ctaButtonHtml, sendTransactionalEmail } from "../_shared/email.ts";
import {
  deterministicFillToken,
  fillTokenExpiresAt,
  fillTokenMintDecision,
  isFillTokenExpired,
  sha256Hex,
} from "../_shared/fillTokenTtl.ts";
import { isPrelaunchBlocked, PRELAUNCH_BLOCKED_MESSAGE } from "../_shared/prelaunch.ts";
import {
  canManageFillMedia,
  coveredDigits,
  FILL_MEDIA_CAP,
  FILL_MEDIA_FOLDER_MAX,
  type FillMediaErrorCode,
  type FillMediaPlate,
  fillMediaDbError,
  fillMediaSizeError,
  fillMediaStoragePath,
  isUuid,
  parseCaption,
  parseDimension,
  parsePendingLinks,
  parseSubject,
  parseTakenWhen,
  resolveOwnPlates,
  subjectDigits,
} from "../_shared/fillMedia.ts";

type LoadBody = { action: "load_by_token"; fill_token: string };
type TreatedPlateDraft = {
  plate_number: string;
  model: string | null;
  color: string | null;
  left_where: string | null;
  manufacturer: string | null;
  logo_slug: string | null;
};

type SaveBody = {
  action: "save_by_token";
  fill_token: string;
  mode: "draft" | "complete";
  draft: {
    vehicle_plate: string;
    odometer_start: string;
    odometer_end: string;
    route: string;
    treatment_detail: string;
    treatment_notes: string;
    treated_plates?: TreatedPlateDraft[];
    treated_plate_pending?: string;
  };
};
type NotifyBody = {
  action: "notify_fill_ready";
  event_id?: string;
  event_responder_ids?: string[];
};
type NotifyOverdueBody = { action: "notify_overdue_fills" };

type RequestBody = LoadBody | SaveBody | NotifyBody | NotifyOverdueBody;

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";


function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fillTokenSecret(): string {
  return Deno.env.get("FILL_TOKEN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
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

function appOrigin(): string {
  const raw = Deno.env.get("INVITE_REDIRECT_TO") ?? "https://yahpz.com/";
  try {
    const url = new URL(raw);
    return `${url.origin}/`;
  } catch {
    return "https://yahpz.com/";
  }
}

function buildFillLink(token: string): string {
  const base = appOrigin();
  const url = new URL(base);
  url.searchParams.set("fill_token", token);
  return url.toString();
}

function buildFillEventLink(eventId: string): string {
  const url = new URL(appOrigin());
  url.searchParams.set("fill_event", eventId);
  return url.toString();
}

function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (Number.isNaN(value)) return "invalid";
  return value;
}

type FieldErrors = Record<string, string>;

const TREATED_PLATE_LEFTOVER_ERROR = "יש ללחוץ הוספה לשמירת המספר";

function leftoverTreatedPlateError(
  pending: string | undefined,
  mode: "draft" | "complete",
): string | undefined {
  if (mode !== "complete") return undefined;
  if (!plateDigits(pending ?? "")) return undefined;
  return TREATED_PLATE_LEFTOVER_ERROR;
}

function normalizeTreatedPlates(
  raw: SaveBody["draft"]["treated_plates"],
): TreatedPlateDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const plate_number = trim(row.plate_number);
    if (!plate_number) return [];
    return [
      {
        plate_number,
        model: typeof row.model === "string" ? row.model : null,
        color: typeof row.color === "string" ? row.color : null,
        left_where:
          typeof row.left_where === "string" && row.left_where.trim()
            ? row.left_where.trim()
            : null,
        manufacturer:
          typeof row.manufacturer === "string" && row.manufacturer.trim()
            ? row.manufacturer.trim()
            : null,
        logo_slug:
          typeof row.logo_slug === "string" && row.logo_slug.trim()
            ? row.logo_slug.trim()
            : null,
      },
    ];
  });
}

function validateDraft(
  draft: SaveBody["draft"],
  mode: "draft" | "complete",
  allowedPlates: string[],
  totalKm: number | null,
  cancelled = false,
): FieldErrors {
  const errors: FieldErrors = {};
  const start = parseOptionalNumber(draft.odometer_start);
  const end = parseOptionalNumber(draft.odometer_end);
  const plate = plateDigits(draft.vehicle_plate);
  const allowed = new Set(allowedPlates.map(plateDigits).filter(Boolean));

  if (start === "invalid") errors.odometer_start = "מד אוץ התחלה חייב להיות מספר.";
  if (end === "invalid") errors.odometer_end = "מד אוץ סיום חייב להיות מספר.";

  if (mode === "complete") {
    // Only the first responder on an event must own a car; one without a linked
    // car rode along, so there is no plate or odometer to report.
    const rodeAlong = allowed.size === 0 && !plate;
    if (!rodeAlong) {
      if (!plate) errors.vehicle_plate = "יש לבחור רכב.";
      else if (allowed.size > 0 && !allowed.has(plate)) {
        errors.vehicle_plate = "יש לבחור רכב מהרשימה המקושרת למשתמש.";
      } else if (allowed.size === 0) {
        errors.vehicle_plate = "לא מקושר רכב למשתמש. פנו למנהל המערכת.";
      }
      if (start == null || start === "invalid") errors.odometer_start = "יש למלא מד אוץ התחלה.";
      if (end == null || end === "invalid") errors.odometer_end = "יש למלא מד אוץ סיום.";
    }
    if (!draft.route.trim()) errors.route = "יש למלא נתיב נסיעה.";
    // Cancelled events have no פירוט minimum. A live event still needs some text;
    // the 25-character bar is enforced by the logged-in clients, not this link.
    if (!cancelled && !draft.treatment_detail.trim()) {
      errors.treatment_detail = "יש למלא פירוט הטיפול.";
    }
    const leftover = leftoverTreatedPlateError(draft.treated_plate_pending, mode);
    if (leftover) errors.treated_plates = leftover;
  }

  // An equal pair is allowed (0/0 included); only a reversed pair is a typo.
  if (
    !errors.odometer_end &&
    typeof start === "number" &&
    typeof end === "number" &&
    end < start
  ) {
    errors.odometer_end = "מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה";
  }

  return errors;
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
    return json(500, { error: "הגדרות השרת חסרות. פנו למנהל המערכת." });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: "גוף הבקשה אינו תקין." });
  }

  // load_by_token / save_by_token authenticate with the fill token itself.
  // Deploy this function with --no-verify-jwt so a stale user session JWT
  // cannot make a still-valid email link look expired.
  if (body.action === "load_by_token") {
    return handleLoadByToken(adminClient, body);
  }

  if (body.action === "save_by_token") {
    return handleSaveByToken(adminClient, body);
  }

  if (isFillMediaAction(body.action)) {
    return handleFillMedia(adminClient, body as unknown as FillMediaBody);
  }

  if (body.action === "notify_fill_ready") {
    return handleNotifyFillReady(adminClient, supabaseUrl, anonKey, serviceKey, req, body);
  }

  if (body.action === "notify_overdue_fills") {
    return handleNotifyOverdueFills(adminClient, serviceKey, req);
  }

  return json(400, { error: "פעולה לא מוכרת." });
  });
});

type AssignmentRow = {
  id: string;
  event_id: string;
  responder_id: string;
  vehicle_plate: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  total_km: number | null;
  route: string | null;
  treatment_detail: string | null;
  treatment_notes: string | null;
  status: string;
  updated_at: string | null;
  fill_token_hash: string | null;
  fill_token_expires_at: string | null;
  fill_ready_emailed_at: string | null;
};

async function findAssignmentByToken(
  adminClient: SupabaseClient,
  fillToken: string,
): Promise<AssignmentRow | null> {
  const hash = await sha256Hex(fillToken);
  const { data, error } = await adminClient
    .from("event_responders")
    .select(
      `id, event_id, responder_id, vehicle_plate, odometer_start, odometer_end, total_km,
       route, treatment_detail, treatment_notes, status, updated_at,
       fill_token_hash, fill_token_expires_at, fill_ready_emailed_at`,
    )
    .eq("fill_token_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  return data as AssignmentRow;
}

const SHIFT_BORN_MESSAGE = "אירוע ממשמרת מתועד בדוח המשמרת המשותף.";

/** Shift-born events are documented once for the crew, never through a per-responder link. */
function shiftBornResponse(eventId: string) {
  return json(400, { error: SHIFT_BORN_MESSAGE, code: "shift_born", event_id: eventId });
}

async function isShiftBornEvent(adminClient: SupabaseClient, eventId: string): Promise<boolean> {
  const { data } = await adminClient.from("events").select("origin").eq("id", eventId).maybeSingle();
  return (data as { origin?: string } | null)?.origin === "shift";
}

async function handleLoadByToken(adminClient: SupabaseClient, body: LoadBody) {
  const fillToken = trim(body.fill_token);
  if (!fillToken) {
    return json(400, { error: "קישור הדיווח אינו תקין או שפג תוקפו.", code: "invalid" });
  }

  const assignment = await findAssignmentByToken(adminClient, fillToken);
  if (!assignment) {
    return json(400, { error: "קישור הדיווח אינו תקין או שפג תוקפו.", code: "invalid" });
  }
  if (await isPrelaunchBlocked(adminClient, assignment.responder_id)) {
    return json(403, { error: PRELAUNCH_BLOCKED_MESSAGE, code: "prelaunch" });
  }

  if (await isShiftBornEvent(adminClient, assignment.event_id)) {
    return shiftBornResponse(assignment.event_id);
  }

  // Opening or refreshing the same email link must keep working — do not
  // consume or remint the token here.
  const expired = isFillTokenExpired(assignment.fill_token_expires_at);

  if (expired) {
    return json(400, {
      error: "קישור הדיווח אינו תקין או שפג תוקפו.",
      code: "expired",
      event_id: assignment.event_id,
    });
  }

  const context = await buildFillContext(adminClient, assignment);
  if (!context) {
    return json(400, {
      error: "קישור הדיווח אינו תקין או שפג תוקפו.",
      code: "gone",
      event_id: assignment.event_id,
    });
  }

  return json(200, { context });
}

async function buildFillContext(adminClient: SupabaseClient, assignment: AssignmentRow) {
  const [{ data: event }, { data: vehicles }, { data: treatedPlateRows }] = await Promise.all([
    adminClient
      .from("events")
      .select(
        `
        id, status, event_date, police_event_id, location, is_cancelled,
        event_type:event_types(name),
        road:roads(name),
        shift_lead:profiles(full_name, callsign)
      `,
      )
      .eq("id", assignment.event_id)
      .maybeSingle(),
    adminClient
      .from("vehicles")
      .select("plate_number, model, archived, is_default")
      .eq("user_id", assignment.responder_id),
    adminClient
      .from("event_treated_plates")
      .select("plate_number, model, color, left_where, manufacturer, logo_slug, sort_order")
      .eq("event_responder_id", assignment.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!event) return null;

  const row = event as {
    id: string;
    status: string;
    event_date: string;
    police_event_id: string | null;
    location: string | null;
    is_cancelled: boolean;
    event_type: { name: string } | null;
    road: { name: string } | null;
    shift_lead: { full_name: string; callsign: string } | null;
  };

  const existingPlate = assignment.vehicle_plate ? plateDigits(assignment.vehicle_plate) : "";
  const totalKm = assignment.total_km;
  const odometerStart =
    assignment.odometer_start != null ? String(assignment.odometer_start) : "";
  const odometerEnd =
    assignment.odometer_end != null ? String(assignment.odometer_end) : "";

  const vehicleMapped = (vehicles ?? [])
    .map((vehicle) => ({
      plate: plateDigits(String(vehicle.plate_number ?? "")),
      model: String(vehicle.model ?? "").trim(),
      archived: Boolean(vehicle.archived),
      isDefault: Boolean(vehicle.is_default) && !vehicle.archived,
    }))
    .filter((vehicle) => vehicle.plate)
    .filter((vehicle) => !vehicle.archived || vehicle.plate === existingPlate);

  const vehicleOptions = vehicleMapped.map(({ plate, model }) => ({ plate, model }));
  const selectedPlate = pickDefaultVehiclePlate(
    vehicleMapped.map(({ plate, isDefault }) => ({ plate, isDefault })),
    existingPlate,
  );

  const shiftLead = row.shift_lead;
  const treated_plates = (treatedPlateRows ?? []).flatMap((plateRow) => {
    const plate_number = String(plateRow.plate_number ?? "").trim();
    if (!plate_number) return [];
    return [
      {
        plate_number,
        model: plateRow.model == null ? null : String(plateRow.model),
        color: plateRow.color == null ? null : String(plateRow.color),
        left_where:
          plateRow.left_where == null || !String(plateRow.left_where).trim()
            ? null
            : String(plateRow.left_where).trim(),
        manufacturer:
          plateRow.manufacturer == null || !String(plateRow.manufacturer).trim()
            ? null
            : String(plateRow.manufacturer).trim(),
        logo_slug:
          plateRow.logo_slug == null || !String(plateRow.logo_slug).trim()
            ? null
            : String(plateRow.logo_slug).trim(),
      },
    ];
  });

  return {
    eventId: row.id,
    assignmentId: assignment.id,
    responderId: assignment.responder_id,
    eventStatus: row.status,
    event_date: row.event_date,
    police_event_id: row.police_event_id,
    event_type_name: row.event_type?.name ?? null,
    is_cancelled: row.is_cancelled ?? false,
    road_name: row.road?.name ?? null,
    location: row.location,
    shift_lead_name: shiftLead ? `${shiftLead.full_name} · ${shiftLead.callsign}` : null,
    totalKm,
    participationStatus: assignment.status,
    updated_at: assignment.updated_at,
    vehicles: vehicleOptions,
    draft: {
      vehicle_plate: selectedPlate,
      odometer_start: odometerStart,
      odometer_end: odometerEnd,
      route: assignment.route ?? "",
      treatment_detail: assignment.treatment_detail ?? "",
      treatment_notes: assignment.treatment_notes ?? "",
      treated_plates,
      treated_plate_pending: "",
    },
  };
}

async function handleSaveByToken(adminClient: SupabaseClient, body: SaveBody) {
  const fillToken = trim(body.fill_token);
  const mode = body.mode === "complete" ? "complete" : "draft";
  if (!fillToken || !body.draft) {
    return json(400, { error: "גוף הבקשה אינו תקין." });
  }

  const assignment = await findAssignmentByToken(adminClient, fillToken);
  if (!assignment) {
    return json(400, { error: "קישור הדיווח אינו תקין או שפג תוקפו.", code: "invalid" });
  }
  if (await isPrelaunchBlocked(adminClient, assignment.responder_id)) {
    return json(403, { error: PRELAUNCH_BLOCKED_MESSAGE, code: "prelaunch" });
  }

  // Draft save must not burn the link — the volunteer may reopen it later
  // on another device from the same email.
  const expired = isFillTokenExpired(assignment.fill_token_expires_at);
  if (expired) {
    return json(400, {
      error: "קישור הדיווח אינו תקין או שפג תוקפו.",
      code: "expired",
      event_id: assignment.event_id,
    });
  }

  const { data: event } = await adminClient
    .from("events")
    .select("id, status, is_cancelled, origin")
    .eq("id", assignment.event_id)
    .maybeSingle();

  if (!event) {
    return json(400, { error: "האירוע לא נמצא.", code: "gone", event_id: assignment.event_id });
  }
  if (event.origin === "shift") {
    return shiftBornResponse(assignment.event_id);
  }

  if (assignment.status === "done") {
    if (mode === "complete") {
      return json(200, {
        ok: true,
        eventStatus: event.status,
        participationStatus: "done",
      });
    }
    return json(400, {
      error: "לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך.",
    });
  }
  // A cancelled event is still logged like any other. Photos stay frozen
  // in the database; this write is the report only.
  if (event.status === "done") {
    return json(400, {
      error: "לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך.",
    });
  }

  const { data: vehicles } = await adminClient
    .from("vehicles")
    .select("plate_number, archived")
    .eq("user_id", assignment.responder_id);

  const existingPlate = assignment.vehicle_plate ? plateDigits(assignment.vehicle_plate) : "";
  const allowedPlates = (vehicles ?? [])
    .map((v) => ({
      plate: plateDigits(String(v.plate_number ?? "")),
      archived: Boolean(v.archived),
    }))
    .filter((v) => v.plate && (!v.archived || v.plate === existingPlate))
    .map((v) => v.plate);

  const totalKm = assignment.total_km;
  const draft = {
    vehicle_plate: trim(body.draft.vehicle_plate),
    odometer_start: trim(body.draft.odometer_start),
    odometer_end: trim(body.draft.odometer_end),
    route: typeof body.draft.route === "string" ? body.draft.route : "",
    treatment_detail:
      typeof body.draft.treatment_detail === "string" ? body.draft.treatment_detail : "",
    treatment_notes:
      typeof body.draft.treatment_notes === "string" ? body.draft.treatment_notes : "",
    treated_plates: normalizeTreatedPlates(body.draft.treated_plates),
    treated_plate_pending:
      typeof body.draft.treated_plate_pending === "string"
        ? body.draft.treated_plate_pending
        : "",
  };

  const fieldErrors = validateDraft(
    draft,
    mode,
    allowedPlates,
    totalKm,
    Boolean(event.is_cancelled),
  );
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

  const { data: updated, error } = await adminClient
    .from("event_responders")
    .update({
      vehicle_plate: formatPlate(draft.vehicle_plate) || null,
      odometer_start: start,
      odometer_end: end,
      route: draft.route.trim() || null,
      treatment_detail: draft.treatment_detail.trim() || null,
      treatment_notes: draft.treatment_notes.trim() || null,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    if (mode === "complete") {
      const { data: landed } = await adminClient
        .from("event_responders")
        .select("status")
        .eq("id", assignment.id)
        .maybeSingle();
      if (landed?.status === "done") {
        return json(200, {
          ok: true,
          eventStatus: event.status,
          participationStatus: "done",
        });
      }
    }
    return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
  }

  const { error: deletePlatesError } = await adminClient
    .from("event_treated_plates")
    .delete()
    .eq("event_responder_id", assignment.id);
  if (deletePlatesError) {
    return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
  }
  if (draft.treated_plates.length > 0) {
    const { error: plateError } = await adminClient.from("event_treated_plates").insert(
      draft.treated_plates.map((row, index) => ({
        event_responder_id: assignment.id,
        plate_number: row.plate_number,
        model: row.model,
        color: row.color,
        left_where: row.left_where,
        manufacturer: row.manufacturer,
        logo_slug: row.logo_slug,
        sort_order: index,
      })),
    );
    if (plateError) {
      return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
    }
  }

  if (mode === "complete") {
    const { data: completed, error: doneError } = await adminClient
      .from("event_responders")
      .update({
        status: "done",
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.id)
      .select("id")
      .maybeSingle();
    if (doneError || !completed) {
      const { data: landed } = await adminClient
        .from("event_responders")
        .select("status")
        .eq("id", assignment.id)
        .maybeSingle();
      if (landed?.status !== "done") {
        return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
      }
    }
  }

  const { data: eventStatus, error: statusError } = await adminClient.rpc(
    "apply_event_status_from_participations",
    { p_event_id: assignment.event_id },
  );
  if (statusError) {
    // The report itself is saved; only the event's status lags until the next save.
    console.error("apply_event_status_from_participations failed", assignment.event_id, statusError.message);
  }

  return json(200, {
    ok: true,
    eventStatus: eventStatus ?? null,
    participationStatus: mode === "complete" ? "done" : "in_progress",
  });
}

// ---------------------------------------------------------------------------
// Photos on the email-link form. The fill token stands in for the responder:
// every action is scoped to that assignment's event, and writes act as that
// responder (uploaded_by, own photos only, own report's vehicles only). The
// service role skips RLS, so the checks the event_media policies make are made
// here; table triggers (20-item cap, cancelled events, type and size) still run.
// ---------------------------------------------------------------------------

const FILL_MEDIA_ACTIONS = [
  "media_list",
  "media_coverage",
  "media_upload_url",
  "media_create",
  "media_update",
  "media_delete",
  "media_link_pending",
] as const;

type FillMediaAction = (typeof FILL_MEDIA_ACTIONS)[number];

type FillMediaBody = {
  action: FillMediaAction;
  fill_token?: unknown;
  plates_only?: unknown;
  media_id?: unknown;
  mime_type?: unknown;
  byte_size?: unknown;
  width?: unknown;
  height?: unknown;
  taken_when?: unknown;
  caption?: unknown;
  subject?: unknown;
  links?: unknown;
};

function isFillMediaAction(action: unknown): action is FillMediaAction {
  return typeof action === "string" && (FILL_MEDIA_ACTIONS as readonly string[]).includes(action);
}

const MEDIA_BUCKET = "event-media";
const MEDIA_SELECT =
  "id, event_id, uploaded_by, caption, not_vehicle, taken_when, storage_path, mime_type, byte_size, width, height, created_at, uploader:profiles!event_media_uploaded_by_fkey(full_name), plates:event_media_plates(treated_plate_id)";
const PLATE_SELECT = "id, plate_number, model, color, logo_slug, event_responder_id, event_id";

type MediaScope = { eventId: string; assignmentId: string; responderId: string };

type MediaRow = {
  id: string;
  event_id: string;
  uploaded_by: string;
  caption: string | null;
  not_vehicle: boolean | null;
  taken_when: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  created_at: string;
  uploader?: { full_name: string | null } | { full_name: string | null }[] | null;
  plates?: { treated_plate_id: string } | { treated_plate_id: string }[] | null;
};

type PlateRow = FillMediaPlate & {
  model: string | null;
  color: string | null;
  logo_slug: string | null;
  event_id: string | null;
};

function mediaError(code: FillMediaErrorCode | "invalid" | "expired", status = 400) {
  return json(status, { code });
}

const WRITE_ACTIONS: readonly FillMediaAction[] = [
  "media_upload_url",
  "media_create",
  "media_update",
  "media_delete",
  "media_link_pending",
];

/** Token valid and unexpired, not a shift-born event; writes also need a live event. */
async function authorizeFillMedia(
  adminClient: SupabaseClient,
  body: FillMediaBody,
): Promise<{ ok: true; scope: MediaScope } | { ok: false; response: Response }> {
  const fillToken = trim(body.fill_token);
  if (!fillToken) return { ok: false, response: mediaError("invalid") };
  const assignment = await findAssignmentByToken(adminClient, fillToken);
  if (!assignment) return { ok: false, response: mediaError("invalid") };
  if (isFillTokenExpired(assignment.fill_token_expires_at)) {
    return { ok: false, response: mediaError("expired") };
  }
  if (await isPrelaunchBlocked(adminClient, assignment.responder_id)) {
    return { ok: false, response: json(403, { code: "prelaunch" }) };
  }
  const { data: event } = await adminClient
    .from("events")
    .select("id, is_cancelled, origin")
    .eq("id", assignment.event_id)
    .maybeSingle();
  if (!event || event.origin === "shift") {
    return { ok: false, response: mediaError("forbidden", 403) };
  }
  if (event.is_cancelled && WRITE_ACTIONS.includes(body.action)) {
    return { ok: false, response: mediaError("cancelled") };
  }
  return {
    ok: true,
    scope: {
      eventId: assignment.event_id,
      assignmentId: assignment.id,
      responderId: assignment.responder_id,
    },
  };
}

async function handleFillMedia(adminClient: SupabaseClient, body: FillMediaBody) {
  const auth = await authorizeFillMedia(adminClient, body);
  if (!auth.ok) return auth.response;
  const scope = auth.scope;
  switch (body.action) {
    case "media_list":
      return mediaList(adminClient, scope, body.plates_only === true);
    case "media_coverage":
      return mediaCoverage(adminClient, scope);
    case "media_upload_url":
      return mediaUploadUrl(adminClient, scope, body);
    case "media_create":
      return mediaCreate(adminClient, scope, body);
    case "media_update":
      return mediaUpdate(adminClient, scope, body);
    case "media_delete":
      return mediaDelete(adminClient, scope, body);
    case "media_link_pending":
      return mediaLinkPending(adminClient, scope, body);
  }
}

/** Every vehicle on the event: shared rows and each responder's report rows. */
async function eventPlates(
  adminClient: SupabaseClient,
  eventId: string,
): Promise<PlateRow[] | null> {
  const [eventKeyed, responderKeyed] = await Promise.all([
    adminClient.from("event_treated_plates").select(PLATE_SELECT).eq("event_id", eventId),
    adminClient
      .from("event_treated_plates")
      .select(
        `${PLATE_SELECT}, event_responders!event_treated_plates_event_responder_id_fkey!inner(event_id)`,
      )
      .eq("event_responders.event_id", eventId),
  ]);
  if (eventKeyed.error || responderKeyed.error) return null;
  const seen = new Set<string>();
  const out: PlateRow[] = [];
  for (const row of [...(responderKeyed.data ?? []), ...(eventKeyed.data ?? [])]) {
    const plate = row as Record<string, unknown>;
    const id = typeof plate.id === "string" ? plate.id : "";
    const plateNumber = typeof plate.plate_number === "string" ? plate.plate_number : "";
    if (!id || !plateNumber || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      plate_number: plateNumber,
      model: (plate.model as string | null) ?? null,
      color: (plate.color as string | null) ?? null,
      logo_slug: (plate.logo_slug as string | null) ?? null,
      event_responder_id: (plate.event_responder_id as string | null) ?? null,
      event_id: (plate.event_id as string | null) ?? null,
    });
  }
  return out;
}

function plateIdsOf(row: MediaRow): string[] {
  const plates = row.plates;
  if (!plates) return [];
  const rows = Array.isArray(plates) ? plates : [plates];
  return [...new Set(rows.map((plate) => plate.treated_plate_id).filter(Boolean))];
}

function uploaderNameOf(row: MediaRow): string | null {
  const uploader = row.uploader;
  if (!uploader) return null;
  if (Array.isArray(uploader)) return uploader[0]?.full_name ?? null;
  return uploader.full_name ?? null;
}

async function withSignedUrls(adminClient: SupabaseClient, rows: MediaRow[]) {
  const { data: signed } = rows.length > 0
    ? await adminClient.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(rows.map((row) => row.storage_path), 3600)
    : { data: [] };
  const urlByPath = new Map(
    (signed ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
    ),
  );
  return rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    uploaded_by: row.uploaded_by,
    uploader_name: uploaderNameOf(row),
    treated_plate_ids: plateIdsOf(row),
    not_vehicle: Boolean(row.not_vehicle),
    caption: row.caption,
    taken_when: row.taken_when,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    width: row.width,
    height: row.height,
    created_at: row.created_at,
    signed_url: urlByPath.get(row.storage_path) ?? null,
  }));
}

async function mediaList(adminClient: SupabaseClient, scope: MediaScope, platesOnly: boolean) {
  const plates = await eventPlates(adminClient, scope.eventId);
  if (!plates) return mediaError("failed", 500);
  if (platesOnly) return json(200, { plates });
  const { data, error } = await adminClient
    .from("event_media")
    .select(MEDIA_SELECT)
    .eq("event_id", scope.eventId)
    .order("created_at", { ascending: true });
  if (error) return mediaError("failed", 500);
  return json(200, {
    media: await withSignedUrls(adminClient, (data ?? []) as MediaRow[]),
    plates,
  });
}

async function mediaCoverage(adminClient: SupabaseClient, scope: MediaScope) {
  const [plates, media] = await Promise.all([
    eventPlates(adminClient, scope.eventId),
    adminClient
      .from("event_media")
      .select("id, plates:event_media_plates(treated_plate_id)")
      .eq("event_id", scope.eventId),
  ]);
  // A failed read must not look like "no photos": the client then skips the prompt.
  if (!plates || media.error) return mediaError("failed", 500);
  const rows = ((media.data ?? []) as MediaRow[]).map((row) => ({
    treated_plate_ids: plateIdsOf(row),
  }));
  return json(200, { covered: coveredDigits(rows, plates) });
}

async function mediaUploadUrl(adminClient: SupabaseClient, scope: MediaScope, body: FillMediaBody) {
  const sizeIssue = fillMediaSizeError(body.mime_type, body.byte_size);
  if (sizeIssue) return mediaError(sizeIssue);
  const mimeType = body.mime_type as string;

  const [{ count, error: countError }, { data: objects, error: listError }] = await Promise.all([
    adminClient
      .from("event_media")
      .select("id", { count: "exact", head: true })
      .eq("event_id", scope.eventId),
    adminClient.storage.from(MEDIA_BUCKET).list(scope.eventId, { limit: FILL_MEDIA_FOLDER_MAX }),
  ]);
  if (countError || listError) return mediaError("failed", 500);
  if ((count ?? 0) >= FILL_MEDIA_CAP) return mediaError("cap");
  // Files uploaded but never saved count here, so a link cannot fill the bucket.
  if ((objects ?? []).length >= FILL_MEDIA_FOLDER_MAX) return mediaError("cap");

  const mediaId = crypto.randomUUID();
  const path = fillMediaStoragePath(scope.eventId, mediaId, mimeType);
  const { data, error } = await adminClient.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return mediaError("failed", 500);
  return json(200, { media_id: mediaId, path: data.path, token: data.token });
}

/** The uploaded object's real size and type, read back from storage. */
async function storedObject(
  adminClient: SupabaseClient,
  eventId: string,
  path: string,
): Promise<{ size: number; mimetype: string } | null> {
  const name = path.slice(eventId.length + 1);
  const { data, error } = await adminClient.storage
    .from(MEDIA_BUCKET)
    .list(eventId, { search: name, limit: 10 });
  if (error) return null;
  const hit = (data ?? []).find((row) => row.name === name);
  const metadata = hit?.metadata as { size?: unknown; mimetype?: unknown } | undefined;
  if (!metadata || typeof metadata.size !== "number") return null;
  return {
    size: metadata.size,
    mimetype: typeof metadata.mimetype === "string" ? metadata.mimetype : "",
  };
}

/** Replaces the photo's vehicle links with this responder's saved rows for the digits. */
async function replaceOwnLinks(
  adminClient: SupabaseClient,
  scope: MediaScope,
  mediaId: string,
  digits: string[],
): Promise<{ ok: true; ids: string[]; pending: string[] } | { ok: false }> {
  let ids: string[] = [];
  let pending: string[] = [];
  if (digits.length > 0) {
    const plates = await eventPlates(adminClient, scope.eventId);
    if (!plates) return { ok: false };
    const resolved = resolveOwnPlates(plates, digits, scope.assignmentId);
    ids = resolved.ids;
    pending = resolved.missing;
  }
  const { error: deleteError } = await adminClient
    .from("event_media_plates")
    .delete()
    .eq("media_id", mediaId);
  if (deleteError) return { ok: false };
  if (ids.length > 0) {
    const { error } = await adminClient
      .from("event_media_plates")
      .insert(ids.map((treated_plate_id) => ({ media_id: mediaId, treated_plate_id })));
    if (error) return { ok: false };
  }
  return { ok: true, ids, pending };
}

async function mediaCreate(adminClient: SupabaseClient, scope: MediaScope, body: FillMediaBody) {
  const takenWhen = parseTakenWhen(body.taken_when);
  const caption = parseCaption(body.caption);
  const subject = parseSubject(body.subject);
  if (!isUuid(body.media_id) || !takenWhen || !subject) return mediaError("bad_request");
  if (!caption.ok) return mediaError("caption");
  const mimeType = typeof body.mime_type === "string" ? body.mime_type : "";
  if (fillMediaSizeError(mimeType, 1)) return mediaError("bad_type");

  const path = fillMediaStoragePath(scope.eventId, body.media_id, mimeType);
  const stored = await storedObject(adminClient, scope.eventId, path);
  if (!stored) return mediaError("upload_missing");
  const removeObject = () => adminClient.storage.from(MEDIA_BUCKET).remove([path]);
  if (stored.mimetype && stored.mimetype !== mimeType) {
    await removeObject();
    return mediaError("bad_type");
  }
  const sizeIssue = fillMediaSizeError(mimeType, stored.size);
  if (sizeIssue) {
    await removeObject();
    return mediaError(sizeIssue);
  }

  const { data, error } = await adminClient
    .from("event_media")
    .insert({
      id: body.media_id,
      event_id: scope.eventId,
      uploaded_by: scope.responderId,
      caption: caption.caption,
      taken_when: takenWhen,
      storage_path: path,
      mime_type: mimeType,
      byte_size: stored.size,
      width: parseDimension(body.width),
      height: parseDimension(body.height),
      not_vehicle: subject.kind === "not_vehicle",
    })
    .select(MEDIA_SELECT)
    .single();
  if (error || !data) {
    // A duplicate id means the row exists already: keep its file.
    if (!error?.message?.includes("duplicate key")) await removeObject();
    return mediaError(fillMediaDbError(error?.message));
  }

  const linked = await replaceOwnLinks(adminClient, scope, body.media_id, subjectDigits(subject));
  if (!linked.ok) {
    await adminClient.from("event_media").delete().eq("id", body.media_id);
    await removeObject();
    return mediaError("failed", 500);
  }
  const [media] = await withSignedUrls(adminClient, [data as MediaRow]);
  return json(200, {
    media: { ...media, treated_plate_ids: linked.ids },
    pending_digits: linked.pending,
  });
}

async function ownMedia(
  adminClient: SupabaseClient,
  scope: MediaScope,
  mediaId: unknown,
): Promise<{ id: string; storage_path: string } | null> {
  if (!isUuid(mediaId)) return null;
  const { data } = await adminClient
    .from("event_media")
    .select("id, event_id, uploaded_by, storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  const row = data as { id: string; event_id: string; uploaded_by: string; storage_path: string } | null;
  if (!canManageFillMedia(row, { eventId: scope.eventId, responderId: scope.responderId })) {
    return null;
  }
  return row;
}

async function mediaUpdate(adminClient: SupabaseClient, scope: MediaScope, body: FillMediaBody) {
  const subject = parseSubject(body.subject);
  if (!subject) return mediaError("bad_request");
  const media = await ownMedia(adminClient, scope, body.media_id);
  if (!media) return mediaError("forbidden", 403);

  const write: Record<string, unknown> = { not_vehicle: subject.kind === "not_vehicle" };
  if (body.taken_when !== undefined) {
    const takenWhen = parseTakenWhen(body.taken_when);
    if (!takenWhen) return mediaError("bad_request");
    write.taken_when = takenWhen;
  }
  if (body.caption !== undefined) {
    const caption = parseCaption(body.caption);
    if (!caption.ok) return mediaError("caption");
    write.caption = caption.caption;
  }
  const { error } = await adminClient.from("event_media").update(write).eq("id", media.id);
  if (error) return mediaError(fillMediaDbError(error.message));

  const linked = await replaceOwnLinks(adminClient, scope, media.id, subjectDigits(subject));
  if (!linked.ok) return mediaError("failed", 500);
  return json(200, { ids: linked.ids, pending_digits: linked.pending });
}

async function mediaDelete(adminClient: SupabaseClient, scope: MediaScope, body: FillMediaBody) {
  const media = await ownMedia(adminClient, scope, body.media_id);
  if (!media) return mediaError("forbidden", 403);
  const { error } = await adminClient.from("event_media").delete().eq("id", media.id);
  if (error) return mediaError(fillMediaDbError(error.message));
  await adminClient.storage.from(MEDIA_BUCKET).remove([media.storage_path]);
  return json(200, { ok: true });
}

/** After a report save: link this responder's photos to the vehicles saved just now. */
async function mediaLinkPending(
  adminClient: SupabaseClient,
  scope: MediaScope,
  body: FillMediaBody,
) {
  const links = parsePendingLinks(body.links);
  if (links.length === 0) return json(200, { waiting: [] });
  const [{ data: mediaRows, error: mediaReadError }, plates] = await Promise.all([
    adminClient
      .from("event_media")
      .select("id, event_id, uploaded_by")
      .in("id", links.map((link) => link.mediaId)),
    eventPlates(adminClient, scope.eventId),
  ]);
  if (mediaReadError || !plates) return mediaError("failed", 500);
  const own = new Set(
    ((mediaRows ?? []) as { id: string; event_id: string; uploaded_by: string }[])
      .filter((row) =>
        canManageFillMedia(row, { eventId: scope.eventId, responderId: scope.responderId })
      )
      .map((row) => row.id),
  );
  const rows: { media_id: string; treated_plate_id: string }[] = [];
  const waiting: { mediaId: string; digits: string[] }[] = [];
  for (const link of links) {
    if (!own.has(link.mediaId)) continue;
    const { ids, missing } = resolveOwnPlates(plates, link.digits, scope.assignmentId);
    for (const id of ids) rows.push({ media_id: link.mediaId, treated_plate_id: id });
    if (missing.length > 0) waiting.push({ mediaId: link.mediaId, digits: missing });
  }
  if (rows.length > 0) {
    const { error } = await adminClient
      .from("event_media_plates")
      .upsert(rows, { onConflict: "media_id,treated_plate_id", ignoreDuplicates: true });
    if (error) return mediaError("failed", 500);
  }
  return json(200, { waiting });
}

async function handleNotifyFillReady(
  adminClient: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  req: Request,
  body: NotifyBody,
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "יש להתחבר מחדש." });
  }

  const token = authHeader.slice("Bearer ".length).trim();
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

    const [{ data: isAdmin }, { data: isLead }] = await Promise.all([
      adminClient.rpc("has_role", { uid: user.id, r: "admin" }),
      adminClient.rpc("has_role", { uid: user.id, r: "shift_lead" }),
    ]);
    if (!isAdmin && !isLead) {
      return json(403, { error: "אין לך הרשאה לפעולה זו." });
    }
    if (await isPrelaunchBlocked(adminClient, user.id)) {
      return json(403, { error: PRELAUNCH_BLOCKED_MESSAGE, code: "prelaunch" });
    }
  }

  const eventId = trim(body.event_id);
  const ids = Array.isArray(body.event_responder_ids)
    ? body.event_responder_ids.map(trim).filter(Boolean)
    : [];

  if (!eventId && ids.length === 0) {
    return json(400, { error: "חסר מזהה אירוע או שיבוץ." });
  }

  let query = adminClient
    .from("event_responders")
    .select(
      `id, event_id, responder_id, total_km, status, fill_token_hash, fill_token_expires_at, fill_ready_emailed_at,
       event:events!inner(id, is_cancelled, event_date, status, origin,
         event_type:event_types(name),
         road:roads(name)
       ),
       profile:profiles!responder_id(id, full_name, active, is_app_review_demo)`,
    );

  if (ids.length > 0) {
    query = query.in("id", ids);
  } else {
    query = query.eq("event_id", eventId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return json(500, { error: "טעינת השיבוצים נכשלה.", detail: error.message });
  }

  const sent: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const row of rows ?? []) {
    const assignment = row as {
      id: string;
      event_id: string;
      responder_id: string;
      total_km: number | null;
      status: string;
      fill_token_hash: string | null;
      fill_token_expires_at: string | null;
      fill_ready_emailed_at: string | null;
      event: {
        id: string;
        is_cancelled: boolean;
        event_date: string;
        status: string;
        origin: string | null;
        event_type: { name: string } | null;
        road: { name: string } | null;
      };
      profile: {
        id: string;
        full_name: string;
        active: boolean;
        is_app_review_demo: boolean;
      } | null;
    };

    if (assignment.fill_ready_emailed_at) {
      skipped.push({ id: assignment.id, reason: "already_sent" });
      continue;
    }
    if (assignment.status === "done") {
      skipped.push({ id: assignment.id, reason: "done" });
      continue;
    }
    if (assignment.event?.is_cancelled) {
      skipped.push({ id: assignment.id, reason: "cancelled" });
      continue;
    }
    if (assignment.event?.origin === "shift") {
      skipped.push({ id: assignment.id, reason: "shift_born" });
      continue;
    }
    if (!assignment.profile || assignment.profile.active !== true) {
      skipped.push({ id: assignment.id, reason: "inactive" });
      continue;
    }
    if (assignment.profile.is_app_review_demo) {
      skipped.push({ id: assignment.id, reason: "app_review_demo" });
      continue;
    }

    const { data: authData } = await adminClient.auth.admin.getUserById(assignment.responder_id);
    const email = authData.user?.email?.trim().toLowerCase() ?? "";
    if (!email) {
      skipped.push({ id: assignment.id, reason: "no_email" });
      continue;
    }

    const ensured = await ensureFillToken(adminClient, assignment, { replaceLegacy: true });
    if (!ensured.raw) {
      skipped.push({ id: assignment.id, reason: "mint_failed" });
      continue;
    }

    const link = buildFillLink(ensured.raw);
    const fullName = assignment.profile.full_name || "";
    const eventDate = assignment.event.event_date ?? "";
    const typeName = assignment.event.event_type?.name ?? "";
    const roadName = assignment.event.road?.name ?? "";
    const contextBits = [eventDate, typeName, roadName].filter(Boolean).join(" · ");

    const htmlInner = [
      `<p style="margin:0 0 16px;">שלום ${escapeHtml(fullName)},</p>`,
      `<p style="margin:0 0 16px;">שובצתם לאירוע. ניתן כעת לתעד פרטים, גם לפני הזנת הקילומטרים.</p>`,
      contextBits
        ? `<p style="margin:0 0 16px;font-size:14px;color:#5B6F86;">${escapeHtml(contextBits)}</p>`
        : "",
      ctaButtonHtml(link, "להשלמת התיעוד"),
      `<p style="margin:0;font-size:14px;color:#5B6F86;">שובצת לאירוע בטעות? התעלם מהודעה זו וצור קשר עם אחד האחמ״שים</p>`,
    ].join("");

    const text = [
      "אבן דרך",
      "יחפ״צ · היחידה הארצית לפינוי צירים",
      "",
      `שלום ${fullName},`,
      "",
      "שובצתם לאירוע. ניתן כעת לתעד פרטים, גם לפני הזנת הקילומטרים.",
      contextBits,
      "",
      link,
      "",
      'שובצת לאירוע בטעות? התעלם מהודעה זו וצור קשר עם אחד האחמ״שים',
    ]
      .filter((line) => line !== "")
      .join("\n");

    const mail = await sendTransactionalEmail({
      to: email,
      subject: "אירוע ממתין לתיעוד - אבן דרך",
      htmlInner,
      textInner: text,
      idempotencyKey: `fill-ready/${assignment.id}`,
    });

    if (!mail.ok) {
      skipped.push({ id: assignment.id, reason: "send_failed" });
      continue;
    }

    const { error: markError } = await adminClient
      .from("event_responders")
      .update({ fill_ready_emailed_at: new Date().toISOString() })
      .eq("id", assignment.id);

    if (markError) {
      // Email already sent — still report sent; marker may retry later via idempotency.
      sent.push(assignment.id);
      continue;
    }

    sent.push(assignment.id);
  }

  return json(200, { sent, skipped });
}

const OVERDUE_48H_MS = 48 * 60 * 60 * 1000;
const OVERDUE_7D_MS = 7 * 24 * 60 * 60 * 1000;
const OVERDUE_FILL_SUBJECT = "חריגת זמנים בתיעוד אירוע - אבן דרך";
const OVERDUE_FILL_CTA = "להשלמת התיעוד";
const OVERDUE_FILL_FUEL =
  "שימו לב! אירוע שלא יתועד על ידי המתנדב, או ללא ק״מ, לא יחושב להחזר הדלק הרבעוני";

type OverdueMailKind = "48h" | "7d";

function nextOverdueMailKind(input: {
  fillCompletableAt: string;
  overdue48hEmailedAt: string | null;
  overdue7dEmailedAt: string | null;
  now?: Date;
}): OverdueMailKind | null {
  const start = Date.parse(input.fillCompletableAt);
  if (Number.isNaN(start)) return null;
  const now = (input.now ?? new Date()).getTime();
  const age = now - start;
  if (age >= OVERDUE_7D_MS && !input.overdue7dEmailedAt) {
    if (!input.overdue48hEmailedAt) return "48h";
    return "7d";
  }
  if (age >= OVERDUE_48H_MS && !input.overdue48hEmailedAt) return "48h";
  return null;
}

function overdueDurationLabel(kind: OverdueMailKind): string {
  return kind === "48h" ? "48 שעות" : "7 ימים";
}

async function ensureFillToken(
  adminClient: SupabaseClient,
  assignment: {
    id: string;
    fill_token_hash: string | null;
    fill_token_expires_at: string | null;
  },
  opts: { replaceLegacy: boolean },
): Promise<{ raw: string | null; decision: ReturnType<typeof fillTokenMintDecision> }> {
  const secret = fillTokenSecret();
  if (!secret) return { raw: null, decision: "mint" };

  const raw = await deterministicFillToken(assignment.id, secret);
  const deterministicHash = await sha256Hex(raw);
  const decision = fillTokenMintDecision({
    storedHash: assignment.fill_token_hash,
    expiresAt: assignment.fill_token_expires_at,
    deterministicHash,
    replaceLegacy: opts.replaceLegacy,
  });

  if (decision === "keep-legacy") return { raw: null, decision };
  if (decision === "reuse") return { raw, decision };

  const { error } = await adminClient
    .from("event_responders")
    .update({
      fill_token_hash: deterministicHash,
      fill_token_expires_at: fillTokenExpiresAt(),
    })
    .eq("id", assignment.id);
  if (error) return { raw: null, decision };
  return { raw, decision };
}

async function handleNotifyOverdueFills(
  adminClient: SupabaseClient,
  serviceKey: string,
  req: Request,
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "יש להתחבר מחדש." });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== serviceKey) {
    return json(403, { error: "אין לך הרשאה לפעולה זו." });
  }

  const cutoff = new Date(Date.now() - OVERDUE_48H_MS).toISOString();
  const { data: rows, error } = await adminClient
    .from("event_responders")
    .select(
      `id, responder_id, status, fill_completable_at, overdue_48h_emailed_at, overdue_7d_emailed_at,
       fill_token_hash, fill_token_expires_at,
       event:events!inner(id, is_cancelled, event_date, origin,
         event_type:event_types(name),
         road:roads(name)
       ),
       profile:profiles!responder_id(id, full_name, active, is_app_review_demo)`,
    )
    .not("fill_completable_at", "is", null)
    .lte("fill_completable_at", cutoff)
    .neq("status", "done");

  if (error) {
    return json(500, { error: "טעינת השיבוצים נכשלה.", detail: error.message });
  }

  const sent: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const row of rows ?? []) {
    const assignment = row as {
      id: string;
      responder_id: string;
      status: string;
      fill_completable_at: string | null;
      overdue_48h_emailed_at: string | null;
      overdue_7d_emailed_at: string | null;
      fill_token_hash: string | null;
      fill_token_expires_at: string | null;
      event: {
        id: string;
        is_cancelled: boolean;
        event_date: string;
        origin: string | null;
        event_type: { name: string } | null;
        road: { name: string } | null;
      };
      profile: {
        id: string;
        full_name: string;
        active: boolean;
        is_app_review_demo: boolean;
      } | null;
    };

    if (!assignment.fill_completable_at) {
      skipped.push({ id: assignment.id, reason: "no_clock" });
      continue;
    }
    if (assignment.event?.is_cancelled) {
      skipped.push({ id: assignment.id, reason: "cancelled" });
      continue;
    }
    if (assignment.event?.origin === "shift") {
      skipped.push({ id: assignment.id, reason: "shift_born" });
      continue;
    }
    if (!assignment.profile || assignment.profile.active !== true) {
      skipped.push({ id: assignment.id, reason: "inactive" });
      continue;
    }
    if (assignment.profile.is_app_review_demo) {
      skipped.push({ id: assignment.id, reason: "app_review_demo" });
      continue;
    }

    const kind = nextOverdueMailKind({
      fillCompletableAt: assignment.fill_completable_at,
      overdue48hEmailedAt: assignment.overdue_48h_emailed_at,
      overdue7dEmailedAt: assignment.overdue_7d_emailed_at,
    });
    if (!kind) {
      skipped.push({ id: assignment.id, reason: "not_due" });
      continue;
    }

    const { data: authData } = await adminClient.auth.admin.getUserById(
      assignment.responder_id,
    );
    const email = authData.user?.email?.trim().toLowerCase() ?? "";
    if (!email) {
      skipped.push({ id: assignment.id, reason: "no_email" });
      continue;
    }

    const ensured = await ensureFillToken(adminClient, assignment, { replaceLegacy: false });
    const eventId = assignment.event?.id;
    const link = ensured.raw
      ? buildFillLink(ensured.raw)
      : eventId
        ? buildFillEventLink(eventId)
        : null;
    if (!link) {
      skipped.push({ id: assignment.id, reason: "mint_failed" });
      continue;
    }
    const fullName = assignment.profile.full_name || "";
    const eventDate = assignment.event.event_date ?? "";
    const typeName = assignment.event.event_type?.name ?? "";
    const roadName = assignment.event.road?.name ?? "";
    const contextBits = [eventDate, typeName, roadName].filter(Boolean).join(" · ");
    const waiting = `יש לך אירוע שממתין לתיעוד מעל ל־${overdueDurationLabel(kind)}`;
    const clickHtml =
      `אפשר ללחוץ <a href="${escapeHtml(link)}">כאן</a> כדי להשלים את התיעוד`;

    const htmlInner = [
      `<p style="margin:0 0 16px;">היי, ${escapeHtml(fullName)}</p>`,
      `<p style="margin:0 0 16px;">${escapeHtml(waiting)}</p>`,
      contextBits
        ? `<p style="margin:0 0 16px;font-size:14px;color:#5B6F86;">${escapeHtml(contextBits)}</p>`
        : "",
      `<p style="margin:0 0 16px;">${clickHtml}</p>`,
      ctaButtonHtml(link, OVERDUE_FILL_CTA),
      `<p style="margin:0;font-size:14px;color:#5B6F86;">${escapeHtml(OVERDUE_FILL_FUEL)}</p>`,
    ].join("");

    const text = [
      "אבן דרך",
      "יחפ״צ · היחידה הארצית לפינוי צירים",
      "",
      `היי, ${fullName}`,
      waiting,
      contextBits,
      "אפשר ללחוץ כאן כדי להשלים את התיעוד",
      link,
      OVERDUE_FILL_FUEL,
    ]
      .filter((line) => line !== "")
      .join("\n");

    const mail = await sendTransactionalEmail({
      to: email,
      subject: OVERDUE_FILL_SUBJECT,
      htmlInner,
      textInner: text,
      idempotencyKey: `overdue-${kind}/${assignment.id}`,
    });

    if (!mail.ok) {
      skipped.push({ id: assignment.id, reason: "send_failed" });
      continue;
    }

    const marker =
      kind === "48h"
        ? { overdue_48h_emailed_at: new Date().toISOString() }
        : { overdue_7d_emailed_at: new Date().toISOString() };
    const { error: markError } = await adminClient
      .from("event_responders")
      .update(marker)
      .eq("id", assignment.id);

    if (markError) {
      sent.push(assignment.id);
      continue;
    }

    sent.push(assignment.id);
  }

  return json(200, { sent, skipped });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
