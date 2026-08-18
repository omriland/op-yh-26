import { formatPlate, plateDigits } from './format'

export type TreatedPlate = {
  plate_number: string
  model: string | null
  color: string | null
  /** Where the vehicle was left — optional short note. */
  left_where: string | null
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

/** Model · color · where-left for read-only stacks (skips empty parts). */
export function treatedPlateMeta(plate: {
  model: string | null
  color: string | null
  left_where: string | null
}): string | null {
  const parts = [
    treatedPlateCaption(plate.model, plate.color),
    plate.left_where?.trim() || null,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
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
    left_where: null,
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

export function setTreatedPlateLeftWhere(
  plates: readonly TreatedPlate[],
  plateDigitsKey: string,
  leftWhere: string,
): TreatedPlate[] {
  const key = plateDigits(plateDigitsKey)
  return plates.map((row) =>
    plateDigits(row.plate_number) === key
      ? { ...row, left_where: leftWhere.length > 0 ? leftWhere : null }
      : row,
  )
}

/** Map DB rows (optional sort_order) into TreatedPlate[], ordered. */
export function mapTreatedPlateRows(
  rows: ReadonlyArray<{
    plate_number?: string | null
    model?: string | null
    color?: string | null
    left_where?: string | null
    sort_order?: number | null
  }> | null | undefined,
): TreatedPlate[] {
  return [...(rows ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((row) => {
      const plate_number = row.plate_number?.trim()
      if (!plate_number) return []
      const left = row.left_where?.trim() || null
      return [
        {
          plate_number,
          model: row.model ?? null,
          color: row.color ?? null,
          left_where: left,
        },
      ]
    })
}
