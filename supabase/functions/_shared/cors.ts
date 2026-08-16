/**
 * Shared CORS allowlist for Yahpaz Edge Functions.
 * Reflects Origin only when it matches production, Netlify, or local Vite.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { isAllowedOrigin } from "./cors.allowlist.ts";

export { isAllowedOrigin } from "./cors.allowlist.ts";

export function buildCorsHeaders(
  req: Request,
  allowHeaders: string,
): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const corsStore = new AsyncLocalStorage<Record<string, string>>();

/** Run a request handler with CORS headers available to `jsonResponse`. */
export function runWithCors<T>(
  corsHeaders: Record<string, string>,
  fn: () => T,
): T {
  return corsStore.run(corsHeaders, fn);
}

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  const cors = corsStore.getStore() ?? {};
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
