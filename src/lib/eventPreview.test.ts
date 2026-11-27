import { describe, expect, it } from "vitest";
import {
  buildEventPreview,
  eventPreviewLabel,
  type EventPreviewSource,
} from "./eventPreview";

function source(
  overrides: Partial<EventPreviewSource> = {},
): EventPreviewSource {
  return {
    id: "event-1",
    event_date: "2026-03-05",
    started_at: "2026-03-05T09:15:00",
    ended_at: "2026-03-05T11:40:00",
    police_event_id: "48213",
    location: "צומת גולני",
    is_cancelled: false,
    frozen_over_60km: false,
    frozen_suspicious_duplicate: false,
    district: { name: "צפון" },
    event_type: { name: "תאונת דרכים" },
    road: { name: "כביש 65" },
    shift_lead: { full_name: "דנה כהן", callsign: "412" },
    responders: [],
    ...overrides,
  } as EventPreviewSource;
}

function responder(
  id: string,
  name: string | null,
  callsign: string | null,
  totalKm: number | null,
  frozen: Partial<{ over: boolean; dup: boolean }> = {},
) {
  return {
    id,
    total_km: totalKm,
    frozen_over_60km: frozen.over ?? false,
    frozen_suspicious_duplicate: frozen.dup ?? false,
    profile:
      name === null ? null : { full_name: name, callsign: callsign ?? "" },
  } as EventPreviewSource["responders"][number];
}

function valueOf(preview: ReturnType<typeof buildEventPreview>, label: string) {
  return preview.rows.find((row) => row.label === label)?.value;
}

describe("buildEventPreview rows", () => {
  it("lists the compact fields in a fixed order with Hebrew labels", () => {
    const preview = buildEventPreview(source());

    expect(preview.rows.map((row) => row.label)).toEqual([
      "סוג אירוע",
      "תאריך",
      "שעות",
      "כביש",
      "מיקום",
      "שלוחה",
      "מספר אירוע",
      "אחמ״ש",
    ]);
  });

  it("formats date as DD.MM.YYYY and the time range as HH:MM to HH:MM", () => {
    const preview = buildEventPreview(source());

    expect(valueOf(preview, "תאריך")).toBe("05.03.2026");
    expect(valueOf(preview, "שעות")).toBe("09:15 - 11:40");
  });

  it("marks an overnight end time with (+1)", () => {
    const preview = buildEventPreview(
      source({ ended_at: "2026-03-06T01:05:00" }),
    );

    expect(valueOf(preview, "שעות")).toBe("09:15 - 01:05 (+1)");
  });

  it("shows only the start when the event has no end yet", () => {
    const preview = buildEventPreview(source({ ended_at: null }));

    expect(valueOf(preview, "שעות")).toBe("09:15");
  });

  it("leaves out the time row when there is neither start nor end", () => {
    const preview = buildEventPreview(
      source({ started_at: null, ended_at: null }),
    );

    expect(preview.rows.some((row) => row.label === "שעות")).toBe(false);
  });

  it("shows the shift lead as callsign then name", () => {
    const preview = buildEventPreview(source());

    expect(valueOf(preview, "אחמ״ש")).toBe("412 · דנה כהן");
  });

  it("drops rows whose value is missing instead of printing blanks", () => {
    const preview = buildEventPreview(
      source({
        police_event_id: null,
        location: null,
        road: null,
        district: null,
        shift_lead: null,
        event_type: null,
      }),
    );

    expect(preview.rows.map((row) => row.label)).toEqual(["תאריך", "שעות"]);
  });

  it("treats a whitespace-only location as missing", () => {
    const preview = buildEventPreview(source({ location: "   " }));

    expect(preview.rows.some((row) => row.label === "מיקום")).toBe(false);
  });

  it("adds a cancelled row only for cancelled events", () => {
    expect(
      valueOf(buildEventPreview(source({ is_cancelled: true })), "בוטל"),
    ).toBe("כן");
    expect(valueOf(buildEventPreview(source()), "בוטל")).toBeUndefined();
  });

  it("shows only the name when the shift lead has no callsign", () => {
    const preview = buildEventPreview(
      source({ shift_lead: { full_name: "דנה כהן", callsign: "" } }),
    );

    expect(valueOf(preview, "אחמ״ש")).toBe("דנה כהן");
  });

  it("uses the event type as the title and falls back to a neutral Hebrew title", () => {
    expect(buildEventPreview(source()).title).toBe("תאונת דרכים");
    expect(buildEventPreview(source({ event_type: null })).title).toBe("אירוע");
  });
});

describe("buildEventPreview frozen state", () => {
  it("reports no freeze flag when none is set", () => {
    expect(buildEventPreview(source()).freezeFlags).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: false,
    });
  });

  it("reports the suspicious duplicate flag on its own", () => {
    const preview = buildEventPreview(
      source({ frozen_suspicious_duplicate: true }),
    );

    expect(preview.freezeFlags).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: true,
    });
  });

  it("reports both flags when both are set", () => {
    const preview = buildEventPreview(
      source({ frozen_over_60km: true, frozen_suspicious_duplicate: true }),
    );

    expect(preview.freezeFlags).toEqual({
      frozen_over_60km: true,
      frozen_suspicious_duplicate: true,
    });
  });

  it("does not flag the event only because a responder is frozen", () => {
    const preview = buildEventPreview(
      source({ responders: [responder("a", "אבי", "2", 90, { over: true })] }),
    );

    expect(preview.freezeFlags).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: false,
    });
    expect(preview.responders[0]?.frozen).toBe(true);
  });

  it("exposes the event flags so the shared frozen notice can be rendered", () => {
    const preview = buildEventPreview(source({ frozen_over_60km: true }));

    expect(preview.freezeFlags).toEqual({
      frozen_over_60km: true,
      frozen_suspicious_duplicate: false,
    });
  });
});

describe("buildEventPreview responders", () => {
  it("summarises each responder with name, callsign, km label and own frozen flag", () => {
    const preview = buildEventPreview(
      source({
        responders: [
          responder("a", "רון לוי", "305", 92.5, { over: true }),
          responder("b", "מיכל בר", "311", 12),
        ],
      }),
    );

    expect(preview.responders).toEqual([
      {
        id: "a",
        name: "רון לוי",
        callsign: "305",
        kmLabel: "92.5 ק״מ",
        frozen: true,
      },
      {
        id: "b",
        name: "מיכל בר",
        callsign: "311",
        kmLabel: "12 ק״מ",
        frozen: false,
      },
    ]);
  });

  it("keeps the order the event page uses and does not re-sort", () => {
    const preview = buildEventPreview(
      source({
        responders: [
          responder("z", "תמר", "1", 5),
          responder("a", "אבי", "2", 80),
        ],
      }),
    );

    expect(preview.responders.map((row) => row.id)).toEqual(["z", "a"]);
  });

  it("shows a dash for a responder without km, but keeps zero km as 0", () => {
    const preview = buildEventPreview(
      source({
        responders: [
          responder("a", "אבי", "2", null),
          responder("b", "בני", "3", 0),
        ],
      }),
    );

    expect(preview.responders.map((row) => row.kmLabel)).toEqual([
      "—",
      "0 ק״מ",
    ]);
  });

  it("survives a responder whose profile is missing", () => {
    const preview = buildEventPreview(
      source({ responders: [responder("a", null, null, 4)] }),
    );

    expect(preview.responders[0]).toMatchObject({
      id: "a",
      name: "—",
      callsign: "",
    });
  });

  it("counts responders and sums their km", () => {
    const preview = buildEventPreview(
      source({
        responders: [
          responder("a", "אבי", "2", 80.5),
          responder("b", "בני", "3", null),
          responder("c", "גדי", "4", 10),
        ],
      }),
    );

    expect(preview.responderCount).toBe(3);
    expect(preview.totalKmLabel).toBe("90.5 ק״מ");
  });

  it("formats km like the event page: thousands separator and no float noise", () => {
    const preview = buildEventPreview(
      source({
        responders: [
          responder("a", "אבי", "2", 1234.5),
          responder("b", "בני", "3", 0.1),
        ],
      }),
    );

    expect(preview.responders[0]?.kmLabel).toBe("1,234.5 ק״מ");
    expect(
      buildEventPreview(
        source({
          responders: [
            responder("a", "א", "1", 0.1),
            responder("b", "ב", "2", 0.2),
          ],
        }),
      ).totalKmLabel,
    ).toBe("0.3 ק״מ");
  });

  it("totals zero km as 0, not as no total", () => {
    const preview = buildEventPreview(
      source({ responders: [responder("a", "אבי", "2", 0)] }),
    );

    expect(preview.totalKmLabel).toBe("0 ק״מ");
  });

  it("has an empty list and no total when nobody responded", () => {
    const preview = buildEventPreview(source({ responders: [] }));

    expect(preview.responders).toEqual([]);
    expect(preview.responderCount).toBe(0);
    expect(preview.totalKmLabel).toBeNull();
  });

  it("has no total when every responder lacks km", () => {
    const preview = buildEventPreview(
      source({ responders: [responder("a", "אבי", "2", null)] }),
    );

    expect(preview.totalKmLabel).toBeNull();
  });
});

describe("eventPreviewLabel", () => {
  it("names the card for screen readers with the police event number", () => {
    expect(eventPreviewLabel(source())).toBe("תצוגה מקדימה של אירוע 48213");
  });

  it("falls back to the event type when there is no police number", () => {
    expect(eventPreviewLabel(source({ police_event_id: null }))).toBe(
      "תצוגה מקדימה של אירוע תאונת דרכים",
    );
  });

  it("falls back to a plain label when neither exists", () => {
    expect(
      eventPreviewLabel(source({ police_event_id: null, event_type: null })),
    ).toBe("תצוגה מקדימה של אירוע");
  });
});
