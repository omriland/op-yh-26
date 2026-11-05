import { describe, expect, it } from 'vitest'
import { DEFAULT_EVENT_LIST_VIEW } from './eventFilters'
import {
  DuplicatePresetNameError,
  PRESET_DUPLICATE_NAME,
  isLocalPreset,
  localPresetsToMigrate,
  isMissingPresetTable,
  parsePresetRows,
  presetNameError,
  readLocalPresets,
  writeLocalPresets,
  type EventFilterPreset,
} from './eventFilterPresets'

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } as unknown as Storage
}

const trucks: EventFilterPreset = {
  id: 'p1',
  name: 'משאיות',
  view: { ...DEFAULT_EVENT_LIST_VIEW, rules: [{ field: 'vehicle_kind', op: 'any_of', value: ['truck'] }] },
}

describe('preset names', () => {
  it('requires a name up to 40 characters, unique per user, never ברירת מחדל', () => {
    expect(presetNameError('  ', [])).toBe('יש להזין שם לתצוגה.')
    expect(presetNameError('א'.repeat(41), [])).toBe('עד 40 תווים.')
    expect(presetNameError(' משאיות ', [trucks])).toBe('כבר קיימת תצוגה בשם זה.')
    expect(presetNameError('ברירת מחדל', [])).toBe('כבר קיימת תצוגה בשם זה.')
    expect(presetNameError('כביש 6', [trucks])).toBeNull()
  })
})

describe('preset rows', () => {
  it('parses table rows and skips malformed ones', () => {
    expect(
      parsePresetRows([
        { id: 'p1', name: ' משאיות ', view: trucks.view },
        { id: 'p2', name: '', view: trucks.view },
        { id: 3, name: 'x', view: trucks.view },
        { id: 'p4', name: 'y', view: null },
      ]),
    ).toEqual([trucks])
    expect(parsePresetRows('nope')).toEqual([])
  })
})

describe('localStorage fallback', () => {
  it('stores presets per user', () => {
    const storage = memoryStorage()
    expect(readLocalPresets('u1', storage)).toEqual([])
    writeLocalPresets('u1', [trucks], storage)
    expect(readLocalPresets('u1', storage)).toEqual([trucks])
    expect(readLocalPresets('u2', storage)).toEqual([])
  })

  it('tells local ids from table ids', () => {
    expect(isLocalPreset('local:abc')).toBe(true)
    expect(isLocalPreset('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false)
  })

  it('falls back only on the missing-table codes, never on a message or another error', () => {
    expect(isMissingPresetTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingPresetTable({ code: '42P01' })).toBe(true)
    expect(isMissingPresetTable({ code: '23505', message: 'event_filter_presets_user_name_uidx' })).toBe(false)
    expect(isMissingPresetTable({ code: '', message: 'event_filter_presets: fetch failed' })).toBe(false)
    expect(isMissingPresetTable({ code: '42501' })).toBe(false)
    expect(isMissingPresetTable(null)).toBe(false)
  })

  it('a taken name surfaces as the duplicate message', () => {
    expect(new DuplicatePresetNameError().message).toBe(PRESET_DUPLICATE_NAME)
  })

  it('moves browser views into the table once, skipping names the table has', () => {
    const local = [
      { ...trucks, id: 'local:1' },
      { ...trucks, id: 'local:2', name: 'כביש 6' },
      { ...trucks, id: 'local:3', name: ' כביש 6 ' },
    ]
    const table = [{ ...trucks, id: 'uuid-1', name: 'משאיות' }]
    expect(localPresetsToMigrate(local, table).map((preset) => preset.id)).toEqual(['local:2'])
    expect(localPresetsToMigrate([], table)).toEqual([])
  })
})
