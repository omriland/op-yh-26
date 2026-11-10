/**
 * Photo actions on the email-link fill form (responder-fill, authorised by the fill
 * token). The token stands in for the responder: these helpers hold what the
 * event_media RLS policies, table checks and storage policies enforce for a
 * logged-in responder, so the service-role path cannot do more than they would.
 *
 * Keep in sync with src/lib/eventMedia.ts and the event_media migrations.
 */

export const FILL_MEDIA_CAP = 20;
export const FILL_MEDIA_CAPTION_MAX = 200;
export const FILL_MEDIA_IMAGE_MAX_BYTES = 1572864;
export const FILL_MEDIA_VIDEO_MAX_BYTES = 26214400;
/** Objects in an event's folder, rows or not. Bounds files uploaded but never saved. */
export const FILL_MEDIA_FOLDER_MAX = FILL_MEDIA_CAP * 2;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export type FillMediaErrorCode =
  | "bad_type"
  | "too_large"
  | "cap"
  | "caption"
  | "bad_request"
  | "forbidden"
  | "cancelled"
  | "upload_missing"
  | "failed";

export type FillMediaTakenWhen = "before_treatment" | "during_after_treatment";

export type FillMediaSubject =
  | { kind: "unassigned" }
  | { kind: "not_vehicle" }
  | { kind: "vehicles"; digits: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function fillMediaExtension(mimeType: unknown): string | null {
  if (typeof mimeType !== "string") return null;
  return EXTENSIONS[mimeType] ?? null;
}

/** Mirrors event_media_type_and_size: JPEG photos up to 1.5 MB, short videos up to 25 MB. */
export function fillMediaSizeError(
  mimeType: unknown,
  byteSize: unknown,
): FillMediaErrorCode | null {
  if (!fillMediaExtension(mimeType)) return "bad_type";
  if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize <= 0) {
    return "bad_request";
  }
  const max = mimeType === "image/jpeg" ? FILL_MEDIA_IMAGE_MAX_BYTES : FILL_MEDIA_VIDEO_MAX_BYTES;
  return byteSize > max ? "too_large" : null;
}

/** The server picks the path; the client never names a storage object. */
export function fillMediaStoragePath(eventId: string, mediaId: string, mimeType: string): string {
  return `${eventId}/${mediaId}.${fillMediaExtension(mimeType) ?? "jpg"}`;
}

export function parseTakenWhen(value: unknown): FillMediaTakenWhen | null {
  return value === "before_treatment" || value === "during_after_treatment" ? value : null;
}

/** Trimmed caption, null when empty, or an error past 200 characters. */
export function parseCaption(
  value: unknown,
): { ok: true; caption: string | null } | { ok: false } {
  if (value == null) return { ok: true, caption: null };
  if (typeof value !== "string") return { ok: false };
  const caption = value.trim();
  if (caption.length > FILL_MEDIA_CAPTION_MAX) return { ok: false };
  return { ok: true, caption: caption || null };
}

function digitsOf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function parseSubject(value: unknown): FillMediaSubject | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { kind?: unknown; digits?: unknown };
  if (raw.kind === "unassigned") return { kind: "unassigned" };
  if (raw.kind === "not_vehicle") return { kind: "not_vehicle" };
  if (raw.kind !== "vehicles" || !Array.isArray(raw.digits)) return null;
  const digits = [...new Set(raw.digits.map(digitsOf).filter(Boolean))].slice(0, FILL_MEDIA_CAP);
  return digits.length > 0 ? { kind: "vehicles", digits } : { kind: "unassigned" };
}

export function subjectDigits(subject: FillMediaSubject): string[] {
  return subject.kind === "vehicles" ? subject.digits : [];
}

export function parseDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value > 0 && value <= 20000 ? value : null;
}

export type FillMediaPlate = {
  id: string;
  plate_number: string;
  event_responder_id?: string | null;
};

/**
 * Saved rows for the digits, limited to this responder's own report. A digit with
 * no saved row yet comes back as missing (linked after the next report save).
 */
export function resolveOwnPlates(
  plates: readonly FillMediaPlate[],
  digits: readonly string[],
  assignmentId: string,
): { ids: string[]; missing: string[] } {
  const ids: string[] = [];
  const missing: string[] = [];
  for (const wanted of new Set(digits)) {
    const hit = plates.find(
      (plate) =>
        plate.event_responder_id === assignmentId && digitsOf(plate.plate_number) === wanted,
    );
    if (hit) ids.push(hit.id);
    else missing.push(wanted);
  }
  return { ids, missing };
}

/** Mirrors the event_media update/delete policies: only the uploader, only on this event. */
export function canManageFillMedia(
  media: { event_id: string; uploaded_by: string } | null | undefined,
  scope: { eventId: string; responderId: string },
): boolean {
  return Boolean(
    media && media.event_id === scope.eventId && media.uploaded_by === scope.responderId,
  );
}

/** Plate digits with at least one photo linked, from any uploader. */
export function coveredDigits(
  media: readonly { treated_plate_ids: readonly string[] }[],
  plates: readonly FillMediaPlate[],
): string[] {
  const byId = new Map(plates.map((plate) => [plate.id, digitsOf(plate.plate_number)]));
  const covered = new Set<string>();
  for (const item of media) {
    for (const id of item.treated_plate_ids) {
      const digits = byId.get(id);
      if (digits) covered.add(digits);
    }
  }
  return [...covered];
}

export type FillPendingLink = { mediaId: string; digits: string[] };

export function parsePendingLinks(value: unknown): FillPendingLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, FILL_MEDIA_CAP).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const raw = row as { mediaId?: unknown; digits?: unknown };
    if (!isUuid(raw.mediaId) || !Array.isArray(raw.digits)) return [];
    const digits = [...new Set(raw.digits.map(digitsOf).filter(Boolean))];
    return digits.length > 0 ? [{ mediaId: raw.mediaId, digits }] : [];
  });
}

/** Postgres trigger and constraint names surfaced as error codes. */
export function fillMediaDbError(message: string | undefined): FillMediaErrorCode {
  if (message?.includes("event_media_cap")) return "cap";
  if (message?.includes("event_cancelled")) return "cancelled";
  if (message?.includes("event_media_type_and_size")) return "too_large";
  if (message?.includes("event_media_caption_len")) return "caption";
  return "failed";
}
