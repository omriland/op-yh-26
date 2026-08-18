import { describe, expect, it } from 'vitest'
import { resolveCarLogoSlug } from './carLogoMap'

describe('resolveCarLogoSlug', () => {
  it('maps Volkswagen Hebrew with country suffix', () => {
    expect(resolveCarLogoSlug('פולקסווגן גרמנ')).toBe('volkswagen')
  })

  it('maps SsangYong Hebrew', () => {
    expect(resolveCarLogoSlug('סאנגיונג ד.קור')).toBe('ssangyong')
  })

  it('maps common makers', () => {
    expect(resolveCarLogoSlug('טויוטה יפן')).toBe('toyota')
    expect(resolveCarLogoSlug('יונדאי קוריאה')).toBe('hyundai')
    expect(resolveCarLogoSlug('קיה')).toBe('kia')
    expect(resolveCarLogoSlug('סקודה')).toBe('skoda')
    expect(resolveCarLogoSlug('ב מ וו')).toBe('bmw')
  })

  it('maps Latin tokens when present', () => {
    expect(resolveCarLogoSlug('BYD China')).toBe('byd')
    expect(resolveCarLogoSlug('TESLA')).toBe('tesla')
  })

  it('returns null for empty or unknown', () => {
    expect(resolveCarLogoSlug('')).toBeNull()
    expect(resolveCarLogoSlug('   ')).toBeNull()
    expect(resolveCarLogoSlug('יצרן לא קיים בעולם')).toBeNull()
  })
})
