const KEY = 'yahpaz.adminUserForm.open'

type StoredDraft = {
  id?: string
  full_name: string
  [key: string]: unknown
}

function sessionStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function isDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as { id?: unknown; full_name?: unknown }
  if (typeof draft.full_name !== 'string') return false
  if (draft.id != null && typeof draft.id !== 'string') return false
  return true
}

/** The form that was open in this tab. Survives a reload; dies when the tab closes. */
export function readOpenAdminUserForm(): StoredDraft | null {
  const store = sessionStore()
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isDraft(parsed)) return null
    if (parsed.id === undefined) {
      const { id: _id, ...rest } = parsed
      return rest
    }
    return parsed
  } catch {
    return null
  }
}

export function writeOpenAdminUserForm(draft: { id?: string; full_name: string }): void {
  const store = sessionStore()
  if (!store) return
  try {
    store.setItem(KEY, JSON.stringify(draft))
  } catch {
    // A full quota must not close the form the user is typing in.
  }
}

export function clearOpenAdminUserForm(): void {
  const store = sessionStore()
  if (!store) return
  try {
    store.removeItem(KEY)
  } catch {
    // Ignore.
  }
}

/** Put a stored open form back onto a blank draft. An edit keeps its user id. */
export function applyOpenAdminUserForm<T extends { id?: string; full_name: string }>(
  base: T,
  stored: unknown,
): T | null {
  if (!isDraft(stored)) return null
  return { ...base, ...stored, id: stored.id }
}
