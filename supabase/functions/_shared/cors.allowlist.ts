/**
 * Pure CORS origin allowlist (no Deno / Node runtime deps).
 * Keep in sync with Edge Function usage via `_shared/cors.ts`.
 */

const FIXED_ORIGINS = new Set([
  "https://yahpz.com",
  "https://www.yahpz.com",
  "https://yahpaz-2026.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

/** Netlify deploy-preview / branch hosts: https://…--yahpaz-2026.netlify.app */
function isNetlifySiteOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith("--yahpaz-2026.netlify.app");
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string): boolean {
  return FIXED_ORIGINS.has(origin) || isNetlifySiteOrigin(origin);
}
