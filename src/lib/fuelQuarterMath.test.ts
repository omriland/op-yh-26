import { describe, expect, it } from 'vitest'
import {
  KM_PER_LITER,
  LITERS_PER_CARD,
  KM_PER_CARD,
  litersFromPayableKm,
  remainingKm,
  suggestedCards,
  quarterMonthIndexes,
  monthKmBuckets,
  unitFuelQuarterKpis,
} from './fuelQuarterMath'

describe('constants', () => {
  it('matches Moshe keys', () => {
    expect(KM_PER_LITER).toBe(6)
    expect(LITERS_PER_CARD).toBe(15)
    expect(KM_PER_CARD).toBe(90)
  })
})

describe('suggestedCards', () => {
  it('floors liters/15 and never goes negative', () => {
    expect(suggestedCards(0)).toBe(0)
    expect(suggestedCards(89)).toBe(0) // 89/6 = 14.83… → floor/15 = 0
    expect(suggestedCards(90)).toBe(1)
    expect(suggestedCards(180)).toBe(2)
    expect(suggestedCards(-50)).toBe(0)
  })
})

describe('unitFuelQuarterKpis', () => {
  it('sums driven km and suggests cards with the same floor(liters/15) metric', () => {
    expect(unitFuelQuarterKpis([])).toEqual({
      totalKm: 0,
      suggestedCards: 0,
      issuedCards: 0,
    })
    expect(
      unitFuelQuarterKpis([
        { quarter_km: 90, cards: 1 },
        { quarter_km: 90, cards: 1 },
      ]),
    ).toEqual({ totalKm: 180, suggestedCards: 2, issuedCards: 2 })
  })

  it('pools leftover km that would not make a card per responder', () => {
    expect(
      unitFuelQuarterKpis([{ quarter_km: 89, cards: 0 }, { quarter_km: 89, cards: 0 }]),
    ).toEqual({ totalKm: 178, suggestedCards: 1, issuedCards: 0 })
  })

  it('sums cards actually issued even when they differ from the unit suggestion', () => {
    expect(
      unitFuelQuarterKpis([
        { quarter_km: 90, cards: 2 },
        { quarter_km: 90, cards: 0 },
      ]),
    ).toEqual({ totalKm: 180, suggestedCards: 2, issuedCards: 2 })
    expect(
      unitFuelQuarterKpis([
        { quarter_km: 180, cards: 1 },
        { quarter_km: 0, cards: 3 },
      ]),
    ).toEqual({ totalKm: 180, suggestedCards: 2, issuedCards: 4 })
  })
})

describe('litersFromPayableKm / remainingKm', () => {
  it('computes liters and remaining', () => {
    expect(litersFromPayableKm(90)).toBe(15)
    expect(remainingKm(90, 1)).toBe(0)
    expect(remainingKm(100, 1)).toBe(10)
    expect(remainingKm(50, 0)).toBe(50)
    expect(remainingKm(-20, 0)).toBe(-20)
  })
})

describe('quarterMonthIndexes', () => {
  it('maps Q1–Q4', () => {
    expect(quarterMonthIndexes(1)).toEqual([1, 2, 3])
    expect(quarterMonthIndexes(4)).toEqual([10, 11, 12])
  })
})

describe('monthKmBuckets', () => {
  it('buckets by local created_at month into the three quarter slots', () => {
    const buckets = monthKmBuckets(
      2026,
      3,
      [
        { created_at: '2026-07-05T12:00:00+03:00', total_km: 10 },
        { created_at: '2026-08-01T00:00:00+03:00', total_km: 20 },
        { created_at: '2026-09-15T23:00:00+03:00', total_km: 5 },
        { created_at: '2026-06-30T12:00:00+03:00', total_km: 99 },
        { created_at: '2026-07-01T12:00:00+03:00', total_km: null },
      ],
    )
    expect(buckets).toEqual({ km_month_1: 10, km_month_2: 20, km_month_3: 5 })
  })
})
