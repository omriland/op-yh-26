import { formatPlate, plateDigits } from './format'

export type TreatedPlate = {
  plate_number: string
  model: string | null
  color: string | null
}

export const TREATED_PLATE_LENGTH_ERROR = 'יש להזין 7 או 8 ספרות.'
export const TREATED_PLATE_DUPLICATE_ERROR = 'מספר זה כבר נוסף.'
export const TREATED_PLATE_LEFTOVER_ERROR = 'השלימו או מחקו את המספר בתחתית.'

export function treatedPlateCaption(
  model: string | null,
  color: string | null,
): string | null {
  const nextModel = model?.trim() ?? ''
  const nextColor = color?.trim() ?? ''
  if (nextModel && nextColor) return `${nextModel} · ${nextColor}`
  if (nextModel) return nextModel
  if (nextColor) return nextColor
  return null
}

export function commitTreatedPlate(
  pending: string,
  plates: readonly TreatedPlate[],
): { ok: true; plate: TreatedPlate; plates: TreatedPlate[] } | { ok: false; error: string } {
  const digits = plateDigits(pending)
  if (digits.length !== 7 && digits.length !== 8) {
    return { ok: false, error: TREATED_PLATE_LENGTH_ERROR }
  }
  if (plates.some((row) => plateDigits(row.plate_number) === digits)) {
    return { ok: false, error: TREATED_PLATE_DUPLICATE_ERROR }
  }
  const plate: TreatedPlate = {
    plate_number: formatPlate(digits),
    model: null,
    color: null,
  }
  return { ok: true, plate, plates: [...plates, plate] }
}

export function leftoverTreatedPlateError(
  pending: string,
  mode: 'draft' | 'complete',
): string | undefined {
  if (mode !== 'complete') return undefined
  if (!plateDigits(pending)) return undefined
  return TREATED_PLATE_LEFTOVER_ERROR
}

export function removeTreatedPlate(
  plates: readonly TreatedPlate[],
  plateDigitsKey: string,
): TreatedPlate[] {
  const key = plateDigits(plateDigitsKey)
  return plates.filter((row) => plateDigits(row.plate_number) !== key)
}
