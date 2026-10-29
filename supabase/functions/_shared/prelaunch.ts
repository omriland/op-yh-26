/**
 * Pre-launch gate (migration 20261029180000_prelaunch_gate.sql). Until
 * 2026-11-01 00:01 Asia/Jerusalem, members other than admins, super admins and
 * the App Review demo account get nothing. RLS holds every client; functions
 * that act for a member with the service role ask the database too, so they
 * share its clock and its exempt list.
 */
export const PRELAUNCH_BLOCKED_MESSAGE = "המערכת תעלה לאוויר ב-1.11";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Fails open: a missing function or a failed call never blocks anyone. */
export async function isPrelaunchBlocked(
  client: RpcClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("is_prelaunch_blocked", { p_uid: userId });
  if (error) {
    console.error("is_prelaunch_blocked", error);
    return false;
  }
  return data === true;
}
