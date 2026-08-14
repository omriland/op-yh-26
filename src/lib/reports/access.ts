import type { AppRole } from '../auth'
import type { ReportAudience, ReportsNavPlacement } from './types'

export function reportsNavPlacement(roles: readonly AppRole[]): ReportsNavPlacement {
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('shift_lead')) return 'shift_lead'
  return 'none'
}

export function visibleReportKinds<T extends { audience: ReportAudience }>(
  kinds: readonly T[],
  roles: readonly AppRole[],
): T[] {
  if (roles.includes('admin')) return [...kinds]
  if (roles.includes('shift_lead')) {
    return kinds.filter((kind) => kind.audience === 'admin_and_shift_lead')
  }
  return []
}

export function canOpenReports(roles: readonly AppRole[]): boolean {
  return reportsNavPlacement(roles) !== 'none'
}
