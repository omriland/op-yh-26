export const SUPPORT_PATH = '/support'

export function isSupportPath(pathname: string): boolean {
  return pathname === SUPPORT_PATH || pathname === `${SUPPORT_PATH}/`
}
