import { describe, expect, it } from 'vitest'
import { addAliasToList, removeAliasFromList } from './highwayJunctionsAdmin'

describe('addAliasToList', () => {
  it('adds a trimmed alias, ignoring duplicates', () => {
    expect(addAliasToList(['נתבג'], '  חבד  ')).toEqual(['נתבג', 'חבד'])
    expect(addAliasToList(['נתבג'], 'נתבג')).toEqual(['נתבג'])
  })
  it('ignores a blank alias', () => {
    expect(addAliasToList(['נתבג'], '   ')).toEqual(['נתבג'])
  })
})

describe('removeAliasFromList', () => {
  it('removes the matching alias', () => {
    expect(removeAliasFromList(['נתבג', 'חבד'], 'נתבג')).toEqual(['חבד'])
  })
  it('is a no-op for a non-existent alias', () => {
    expect(removeAliasFromList(['נתבג'], 'חבד')).toEqual(['נתבג'])
  })
})
