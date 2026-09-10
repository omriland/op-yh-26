/**
 * Pure CORS origin allowlist (no Deno / Node runtime deps).
 * Keep in sync with Edge Function usage via `_shared/cors.ts`.
 *
 * Local Vite often drifts off :5173 (Yahpaz is commonly :5175 when 5173/5174
 * are taken). Allow the default Vite window 5173–5179 only.
 */

const FIXED_ORIGINS = new Set([
  "https://yahpz.com",
  "https://www.yahpz.com",
  "https://yahpaz-2026.netlify.app",
]);

const LOCAL_VITE_PORT_MIN = 5173;
const LOCAL_VITE_PORT_MAX = 5179;

/** Netlify deploy-preview / branch hosts: https://…--yahpaz-2026.netlify.app */
function isNetlifySiteOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith("--yahpaz-2026.netlify.app");
  } catch {
    return false;
  }
}

function isLocalViteOrigin(origin: string): boolean {
  try {
    const { protocol, hostname, port } = new URL(origin);
    const n = Number(port);
    return (
      protocol === "http:" &&
      (hostname === "localhost" || hostname === "127.0.0.1") &&
      Number.isInteger(n) &&
      n >= LOCAL_VITE_PORT_MIN &&
      n <= LOCAL_VITE_PORT_MAX
    );
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string): boolean {
  return FIXED_ORIGINS.has(origin) || isNetlifySiteOrigin(origin) || isLocalViteOrigin(origin);
}
