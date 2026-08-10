import { describe, expect, it } from 'vitest'
import { compareRoadNames, sortByRoadName } from './roadSort'

describe('compareRoadNames', () => {
  it('sorts pure numbers ascending', () => {
    expect(
      ['20', '2', '100', '6'].sort(compareRoadNames),
    ).toEqual(['2', '6', '20', '100'])
  })

  it('puts names with letters after pure numbers', () => {
    expect(
      ['6', '4א', '20', 'מנהרות'].sort(compareRoadNames),
    ).toEqual(['6', '20', '4א', 'מנהרות'])
  })

  it('sorts lettered names by Hebrew locale', () => {
    expect(
      ['כביש החוף', '4א', 'מנהרות'].sort(compareRoadNames),
    ).toEqual(['4א', 'כביש החוף', 'מנהרות'])
  })
})

describe('sortByRoadName', () => {
  it('sorts objects by name with the same rules', () => {
    const rows = [
      { id: 'a', name: '443' },
      { id: 'b', name: '4א' },
      { id: 'c', name: '1' },
      { id: 'd', name: 'מנהרות הכרמל' },
    ]
    expect(sortByRoadName(rows).map((row) => row.name)).toEqual([
      '1',
      '443',
      '4א',
      'מנהרות הכרמל',
    ])
  })
})
