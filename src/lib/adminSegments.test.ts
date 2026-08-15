import { describe, expect, it } from 'vitest'
import { ADMIN_SEGMENTS } from './adminSegments'

describe('ADMIN_SEGMENTS', () => {
  it('places reports after users and drops the retired summary table', () => {
    expect(ADMIN_SEGMENTS.map((segment) => segment.id)).toEqual([
      'users',
      'reports',
      'fuel_quarter',
      'lists',
      'unit_broadcast',
    ])
    expect(ADMIN_SEGMENTS.map((segment) => segment.label)).toEqual([
      'משתמשים',
      'דוחות וסטטיסטיקות',
      'ניהול דלק',
      'הגדרות',
      'תפוצה לכלל היחידה',
    ])
  })
})
