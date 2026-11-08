/**
 * Edge-function copy of `src/lib/eventResponderRelease.ts` and of the SQL
 * `event_released_to_responders`. A manual event is a טיוטה, and no volunteer
 * may see, open or be told about it, until סוג אירוע, או״ק (the number), כביש and
 * מספר אירוע are all filled. Shift-born events are released from the start.
 */

export const EVENT_RELEASE_SELECT =
  "origin, police_event_id, event_type_id, road_id, patrol_callsign, patrol_callsign_prefix, patrol_callsign_number";

export const NOT_RELEASED_MESSAGE = "האירוע עדיין בהזנה אצל האחמ״ש ואינו זמין לתיעוד.";

export type EventReleaseRow = {
  origin?: string | null;
  police_event_id?: string | null;
  event_type_id?: string | null;
  road_id?: string | null;
  patrol_callsign?: string | null;
  patrol_callsign_prefix?: string | null;
  patrol_callsign_number?: string | null;
};

function filled(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export function eventReleasedToResponders(row: EventReleaseRow): boolean {
  if (row.origin === "shift") return true;
  if (!filled(row.police_event_id)) return false;
  if (!filled(row.event_type_id)) return false;
  if (!filled(row.road_id)) return false;
  // Split columns win once either is set; only a legacy row reads the combined value.
  if (filled(row.patrol_callsign_prefix) || filled(row.patrol_callsign_number)) {
    return /\d/.test(row.patrol_callsign_number ?? "");
  }
  return /\d/.test(row.patrol_callsign ?? "");
}
