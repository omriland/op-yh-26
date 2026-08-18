import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  jsonResponse as json,
  runWithCors,
} from "../_shared/cors.ts";
import { ctaButtonHtml, sendTransactionalEmail } from "../_shared/email.ts";

type LoadBody = { action: "load_by_token"; fill_token: string };
type TreatedPlateDraft = {
  plate_number: string;
  model: string | null;
  color: string | null;
  left_where: string | null;
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

const FILL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";


function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomFillToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function plateDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function formatPlate(raw: string): string {
  const digits = plateDigits(raw);
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

function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (Number.isNaN(value)) return "invalid";
  return value;
}

type FieldErrors = Record<string, string>;

const TREATED_PLATE_LEFTOVER_ERROR = "השלימו או מחקו את המספר בתחתית.";

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
      },
    ];
  });
}

function validateDraft(
  draft: SaveBody["draft"],
  mode: "draft" | "complete",
  allowedPlates: string[],
  totalKm: number | null,
): FieldErrors {
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
    const leftover = leftoverTreatedPlateError(draft.treated_plate_pending, mode);
    if (leftover) errors.treated_plates = leftover;
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

  if (body.action === "load_by_token") {
    return handleLoadByToken(adminClient, body);
  }

  if (body.action === "save_by_token") {
    return handleSaveByToken(adminClient, body);
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

async function handleLoadByToken(adminClient: SupabaseClient, body: LoadBody) {
  const fillToken = trim(body.fill_token);
  if (!fillToken) {
    return json(400, { error: "קישור הדיווח אינו תקין או שפג תוקפו.", code: "invalid" });
  }

  const assignment = await findAssignmentByToken(adminClient, fillToken);
  if (!assignment) {
    return json(400, { error: "קישור הדיווח אינו תקין או שפג תוקפו.", code: "invalid" });
  }

  const expired =
    !assignment.fill_token_expires_at ||
    new Date(assignment.fill_token_expires_at).getTime() <= Date.now();

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
      .select("plate_number, model, archived")
      .eq("user_id", assignment.responder_id),
    adminClient
      .from("event_treated_plates")
      .select("plate_number, model, color, left_where, sort_order")
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

  const vehicleOptions = (vehicles ?? [])
    .map((vehicle) => ({
      plate: plateDigits(String(vehicle.plate_number ?? "")),
      model: String(vehicle.model ?? "").trim(),
      archived: Boolean(vehicle.archived),
    }))
    .filter((vehicle) => vehicle.plate)
    .filter((vehicle) => !vehicle.archived || vehicle.plate === existingPlate)
    .map(({ plate, model }) => ({ plate, model }));

  const allowed = new Set(vehicleOptions.map((v) => v.plate));
  const selectedPlate =
    existingPlate && allowed.has(existingPlate)
      ? existingPlate
      : vehicleOptions.length === 1
        ? vehicleOptions[0]!.plate
        : "";

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

  const expired =
    !assignment.fill_token_expires_at ||
    new Date(assignment.fill_token_expires_at).getTime() <= Date.now();
  if (expired) {
    return json(400, {
      error: "קישור הדיווח אינו תקין או שפג תוקפו.",
      code: "expired",
      event_id: assignment.event_id,
    });
  }

  const { data: event } = await adminClient
    .from("events")
    .select("id, status")
    .eq("id", assignment.event_id)
    .maybeSingle();

  if (!event) {
    return json(400, { error: "האירוע לא נמצא.", code: "gone", event_id: assignment.event_id });
  }

  if (assignment.status === "done" || event.status === "done") {
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

  const fieldErrors = validateDraft(draft, mode, allowedPlates, totalKm);
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

  const { data: updated, error } = await adminClient
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
        sort_order: index,
      })),
    );
    if (plateError) {
      return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
    }
  }

  const { data: eventStatus } = await adminClient.rpc("apply_event_status_from_participations", {
    p_event_id: assignment.event_id,
  });

  return json(200, {
    ok: true,
    eventStatus: eventStatus ?? null,
    participationStatus: nextStatus,
  });
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
       event:events!inner(id, is_cancelled, event_date, status,
         event_type:event_types(name),
         road:roads(name)
       ),
       profile:profiles!responder_id(id, full_name, active)`,
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
        event_type: { name: string } | null;
        road: { name: string } | null;
      };
      profile: { id: string; full_name: string; active: boolean } | null;
    };

    if (assignment.fill_ready_emailed_at) {
      skipped.push({ id: assignment.id, reason: "already_sent" });
      continue;
    }
    if (assignment.total_km == null) {
      skipped.push({ id: assignment.id, reason: "no_km" });
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
    if (!assignment.profile || assignment.profile.active !== true) {
      skipped.push({ id: assignment.id, reason: "inactive" });
      continue;
    }

    const { data: authData } = await adminClient.auth.admin.getUserById(assignment.responder_id);
    const email = authData.user?.email?.trim().toLowerCase() ?? "";
    if (!email) {
      skipped.push({ id: assignment.id, reason: "no_email" });
      continue;
    }

    const tokenExpired =
      !assignment.fill_token_expires_at ||
      new Date(assignment.fill_token_expires_at).getTime() <= Date.now();
    let rawToken: string | null = null;

    if (!assignment.fill_token_hash || tokenExpired) {
      rawToken = randomFillToken();
      const hash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + FILL_TOKEN_TTL_MS).toISOString();
      const { error: mintError } = await adminClient
        .from("event_responders")
        .update({
          fill_token_hash: hash,
          fill_token_expires_at: expiresAt,
        })
        .eq("id", assignment.id);
      if (mintError) {
        skipped.push({ id: assignment.id, reason: "mint_failed" });
        continue;
      }
    } else {
      // Token still valid but we never emailed — cannot recover raw token from hash.
      // Re-mint so the email link works.
      rawToken = randomFillToken();
      const hash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + FILL_TOKEN_TTL_MS).toISOString();
      const { error: mintError } = await adminClient
        .from("event_responders")
        .update({
          fill_token_hash: hash,
          fill_token_expires_at: expiresAt,
        })
        .eq("id", assignment.id);
      if (mintError) {
        skipped.push({ id: assignment.id, reason: "mint_failed" });
        continue;
      }
    }

    const link = buildFillLink(rawToken!);
    const fullName = assignment.profile.full_name || "";
    const eventDate = assignment.event.event_date ?? "";
    const typeName = assignment.event.event_type?.name ?? "";
    const roadName = assignment.event.road?.name ?? "";
    const contextBits = [eventDate, typeName, roadName].filter(Boolean).join(" · ");

    const htmlInner = [
      `<p style="margin:0 0 16px;">שלום ${escapeHtml(fullName)},</p>`,
      `<p style="margin:0 0 16px;">האחמ״ש סיים להזין את הקילומטרים לאירוע ששובצתם אליו. ניתן כעת להשלים את הדיווח.</p>`,
      contextBits
        ? `<p style="margin:0 0 16px;font-size:14px;color:#5B6F86;">${escapeHtml(contextBits)}</p>`
        : "",
      ctaButtonHtml(link, "להשלמת הדיווח"),
      `<p style="margin:0 0 16px;font-size:13px;color:#5B6F86;word-break:break-all;">או העתיקו את הכתובת: ${escapeHtml(link)}</p>`,
      `<p style="margin:0;font-size:14px;color:#5B6F86;">אם לא ציפיתם להודעה זו, ניתן להתעלם ממנה.</p>`,
    ].join("");

    const text = [
      "אבן דרך",
      "יחפ״צ · היחידה הארצית לפינוי צירים",
      "",
      `שלום ${fullName},`,
      "",
      "האחמ״ש סיים להזין את הקילומטרים לאירוע ששובצתם אליו. ניתן כעת להשלים את הדיווח.",
      contextBits,
      "",
      link,
      "",
      "אם לא ציפיתם להודעה זו, ניתן להתעלם ממנה.",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const mail = await sendTransactionalEmail({
      to: email,
      subject: "דיווח מוכן להשלמה - אבן דרך",
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
  "שימו לב! אירוע שלא יתועד במלואו לא יחושב להחזר הדלק הרבעוני";

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

async function mintFillToken(
  adminClient: SupabaseClient,
  assignmentId: string,
): Promise<string | null> {
  const rawToken = randomFillToken();
  const hash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + FILL_TOKEN_TTL_MS).toISOString();
  const { error } = await adminClient
    .from("event_responders")
    .update({
      fill_token_hash: hash,
      fill_token_expires_at: expiresAt,
    })
    .eq("id", assignmentId);
  if (error) return null;
  return rawToken;
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
       event:events!inner(id, is_cancelled, event_date,
         event_type:event_types(name),
         road:roads(name)
       ),
       profile:profiles!responder_id(id, full_name, active)`,
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
        is_cancelled: boolean;
        event_date: string;
        event_type: { name: string } | null;
        road: { name: string } | null;
      };
      profile: { id: string; full_name: string; active: boolean } | null;
    };

    if (!assignment.fill_completable_at) {
      skipped.push({ id: assignment.id, reason: "no_clock" });
      continue;
    }
    if (assignment.event?.is_cancelled) {
      skipped.push({ id: assignment.id, reason: "cancelled" });
      continue;
    }
    if (!assignment.profile || assignment.profile.active !== true) {
      skipped.push({ id: assignment.id, reason: "inactive" });
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

    const rawToken = await mintFillToken(adminClient, assignment.id);
    if (!rawToken) {
      skipped.push({ id: assignment.id, reason: "mint_failed" });
      continue;
    }

    const link = buildFillLink(rawToken);
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
