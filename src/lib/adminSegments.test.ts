import { describe, expect, it } from 'vitest'
import { ADMIN_SEGMENTS } from './adminSegments'

describe('ADMIN_SEGMENTS', () => {
  it('places reports after users and drops the retired summary table', () => {
    expect(ADMIN_SEGMENTS.map((segment) => segment.id)).toEqual([
      'users',
      'unit_broadcast',
      'reports',
      'fuel_quarter',
      'lists',
    ])
    expect(ADMIN_SEGMENTS.map((segment) => segment.label)).toEqual([
      'משתמשים',
      'תפוצה לכלל היחידה',
      'דוחות וסטטיסטיקות',
      'ניהול דלק',
      'הגדרות',
    ])
  })
})
