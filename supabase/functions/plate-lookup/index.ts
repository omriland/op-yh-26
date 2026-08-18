import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildCorsHeaders,
  jsonResponse,
  runWithCors,
} from "../_shared/cors.ts";

/**
 * Proxy data.gov.il plate lookup — browsers cannot call data.gov.il directly (no CORS).
 * Public registry data; JWT optional (fill-token / anon).
 */

const RESOURCE_ID = "053cea08-09bc-40ec-8f7a-156f0677aff3";
const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

type Hit = {
  model: string | null;
  color: string | null;
  manufacturer: string | null;
};

function mispar(plate: string): number {
  return Number(String(plate).replace(/\D/g, ""));
}

function parseGovBody(body: string): Hit | null {
  if (!body.trimStart().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(body) as {
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

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return runWithCors(corsHeaders, async () => {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" });
    }

    let plate = "";
    try {
      const body = (await req.json()) as { plate?: unknown };
      plate = typeof body.plate === "string" ? body.plate : "";
    } catch {
      return jsonResponse(400, { error: "invalid_body" });
    }

    const n = mispar(plate);
    if (!n) {
      return jsonResponse(200, { hit: null });
    }

    const params = new URLSearchParams({
      resource_id: RESOURCE_ID,
      filters: JSON.stringify({ mispar_rechev: n }),
      fields: "tzeva_rechev,kinuy_mishari,tozeret_nm",
      limit: "1",
    });
    const url =
      `https://data.gov.il/api/3/action/datastore_search?${params.toString()}`;

    try {
      const res = await fetch(url);
      const text = await res.text();
      return jsonResponse(200, { hit: parseGovBody(text) });
    } catch {
      return jsonResponse(200, { hit: null });
    }
  });
});
