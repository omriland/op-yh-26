export type AdminSegment = 'users' | 'reports' | 'fuel_quarter' | 'lists'

export const ADMIN_SEGMENTS: { id: AdminSegment; label: string }[] = [
  { id: 'users', label: 'משתמשים' },
  { id: 'reports', label: 'דוחות וסטטיסטיקות' },
  { id: 'fuel_quarter', label: 'ניהול כרטיסי דלק' },
  { id: 'lists', label: 'הגדרות' },
]

export const ADMIN_MOBILE_HUB_VIEWS: AdminSegment[] = ADMIN_SEGMENTS.filter(
  (segment) => segment.id !== 'users',
).map((segment) => segment.id)

export function isAdminSegment(view: string): view is AdminSegment {
  return ADMIN_SEGMENTS.some((segment) => segment.id === view)
}
