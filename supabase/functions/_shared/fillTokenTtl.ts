/** Email fill-link lifetime. Volunteers may complete a report weeks after the event. */
export const FILL_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export function fillTokenExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + FILL_TOKEN_TTL_MS).toISOString();
}
