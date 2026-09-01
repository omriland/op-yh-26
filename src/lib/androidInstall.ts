import type { AppRole } from './auth'

export function canShowAndroidInstallMark(input: {
  roles: readonly AppRole[]
  impersonating: boolean
  lastAndroidSeenAt: string | null | undefined
}): boolean {
  return (
    input.roles.includes('super_admin') &&
    !input.impersonating &&
    Boolean(input.lastAndroidSeenAt)
  )
}

export function androidInstallHoverTip(input: {
  versionName: string | null
  versionCode: number | null
  latestVersionCode: number | null
}): string {
  const name = input.versionName?.trim() || (input.versionCode != null ? String(input.versionCode) : '')
  if (
    input.latestVersionCode != null &&
    input.versionCode != null &&
    input.versionCode === input.latestVersionCode
  ) {
    return `${name} · עדכני`
  }
  return name
}

export function parseLatestVersionCode(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const code = (payload as { latestVersionCode?: unknown }).latestVersionCode
  return typeof code === 'number' && Number.isFinite(code) ? code : null
}

export async function fetchAndroidLatestVersionCode(): Promise<number | null> {
  try {
    const response = await fetch('/android/version.json', { cache: 'no-store' })
    if (!response.ok) return null
    return parseLatestVersionCode(await response.json())
  } catch {
    return null
  }
}
