// Account deletion shared by delete-account (a member deletes their own
// account) and admin-users "delete". The database routine
// public.delete_user_account (20261103180000_account_deletion.sql) does the
// work in one transaction; this removes the files it reports afterwards.

type DbError = { message: string } | null;
type AuditFilter = {
  eq(column: string, value: string): AuditFilter;
  limit(count: number): PromiseLike<{ data: unknown[] | null; error: DbError }>;
};
/** The parts of a service-role supabase-js client used here (no npm import, so src tests can load this file). */
export type AdminClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
  from(table: string): { select(columns: string): AuditFilter };
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ error: DbError }> } };
};

export type DeleteAccountResult =
  | { ok: true; status: "deleted" | "simulated"; filesFailed: number }
  | { ok: false; status: number; code: string; error: string };

const REFUSALS: Record<string, { status: number; error: string }> = {
  account_not_found: { status: 404, error: "החשבון לא נמצא." },
  account_already_deleted: { status: 409, error: "החשבון כבר נמחק." },
  account_is_super_admin: { status: 403, error: "לא ניתן למחוק חשבון של מנהל־על." },
  account_is_last_admin: {
    status: 409,
    error: "זהו המנהל האחרון ביחידה. יש למנות מנהל נוסף לפני מחיקת החשבון.",
  },
};

type StorageFile = { bucket: string; path: string };

/** session_id claim of a bearer token already verified by auth.getUser(). */
export function jwtSessionId(authHeader: string | null): string | null {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64)) as { session_id?: unknown };
    return typeof claims.session_id === "string" && claims.session_id ? claims.session_id : null;
  } catch {
    return null;
  }
}

/** True when the session was minted by a super admin's "view as". Fails closed. */
export async function isImpersonationSession(
  adminClient: AdminClient,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return true;
  const { data, error } = await adminClient
    .from("impersonation_audit")
    .select("id")
    .eq("action", "started")
    .eq("session_id", sessionId)
    .limit(1);
  if (error) {
    console.error("delete-account impersonation lookup", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

export async function deleteUserAccount(
  adminClient: AdminClient,
  userId: string,
): Promise<DeleteAccountResult> {
  const { data, error } = await adminClient.rpc("delete_user_account", { p_user_id: userId });
  if (error) {
    const refusal = REFUSALS[error.message];
    if (refusal) return { ok: false, code: error.message, ...refusal };
    console.error("delete_user_account", error.message);
    return { ok: false, status: 500, code: "failed", error: "מחיקת החשבון נכשלה. נסו שוב." };
  }

  const result = data as { status: "deleted" | "simulated"; storage?: StorageFile[] };
  if (result.status === "simulated") return { ok: true, status: "simulated", filesFailed: 0 };

  const byBucket = new Map<string, string[]>();
  for (const file of result.storage ?? []) {
    byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.path]);
  }
  let filesFailed = 0;
  for (const [bucket, paths] of byBucket) {
    const { error: removeError } = await adminClient.storage.from(bucket).remove(paths);
    if (removeError) {
      console.error("delete account files", bucket, paths.length, removeError.message);
      filesFailed += paths.length;
    }
  }
  return { ok: true, status: "deleted", filesFailed };
}
