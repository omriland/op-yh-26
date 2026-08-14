import { describe, expect, it } from 'vitest'
import { csvWithBom, toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows with commas', () => {
    expect(toCsv(['כונן', 'ק״מ'], [['עמרי', '12']])).toBe('כונן,ק״מ\r\nעמרי,12')
  })

  it('quotes cells that contain commas, quotes, or newlines', () => {
    expect(toCsv(['הערות'], [['שלום, "עולם"']])).toBe('הערות\r\n"שלום, ""עולם"""')
  })
})

describe('csvWithBom', () => {
  it('prefixes UTF-8 BOM for Excel', () => {
    expect(csvWithBom('a,b')).toBe('\uFEFFa,b')
  })
})
