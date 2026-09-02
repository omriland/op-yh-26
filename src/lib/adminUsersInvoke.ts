export type AdminUsersInvokeSuccess = {
  ok: true
  message?: string
  user_id?: string
  action_link?: string
}

export type AdminUsersInvokeFailure = { ok: false; error: string }

export type AdminUsersInvokeResult = AdminUsersInvokeSuccess | AdminUsersInvokeFailure

const GENERIC_INVOKE_ERROR = 'הפעולה נכשלה. בדקו את החיבור ונסו שוב.'

export function parseAdminUsersInvokeResult(
  data: unknown,
  error: unknown,
): AdminUsersInvokeResult {
  if (error) {
    return { ok: false, error: GENERIC_INVOKE_ERROR }
  }
  if (data == null || typeof data !== 'object') {
    return { ok: false, error: GENERIC_INVOKE_ERROR }
  }

  const payload = data as {
    error?: string
    message?: string
    user_id?: string
    action_link?: string
  }
  if (payload.error) return { ok: false, error: payload.error }
  return {
    ok: true,
    message: payload.message,
    user_id: payload.user_id,
    action_link: payload.action_link,
  }
}

export function authAdminUserUpdated(result: {
  data: { user: { id: string } | null } | null
  error: { message?: string } | null
}): boolean {
  if (result.error) return false
  return Boolean(result.data?.user?.id)
}
