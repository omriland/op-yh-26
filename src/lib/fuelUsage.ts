import { KM_PER_LITER } from './fuelQuarterMath'
import type { FuelRefundRow } from './fuelRefundReport'

export type FuelUsageRow = FuelRefundRow & { liters: number }

export function litersFromKm(km: number): number {
  return km / KM_PER_LITER
}

export function formatLiters(km: number): string {
  return litersFromKm(km).toFixed(1)
}

export function toUsageRows(rows: FuelRefundRow[]): FuelUsageRow[] {
  return rows.map((row) => ({ ...row, liters: litersFromKm(row.total_km) }))
}

export function usageTotals(rows: FuelRefundRow[]): {
  totalKm: number
  totalLiters: number
  withKm: number
} {
  const totalKm = rows.reduce((sum, row) => sum + row.total_km, 0)
  return {
    totalKm,
    totalLiters: litersFromKm(totalKm),
    withKm: rows.filter((row) => row.total_km > 0).length,
  }
}
