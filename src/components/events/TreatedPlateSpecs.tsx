import type { TreatedPlate } from '../../lib/treatedPlates'

type TreatedPlateSpecsProps = {
  model: string | null
  color: string | null
}

/** Model + color as labeled rows (mobile-friendly; brand is the logo beside the plate). */
export function TreatedPlateSpecs({ model, color }: TreatedPlateSpecsProps) {
  const nextModel = model?.trim() ?? ''
  const nextColor = color?.trim() ?? ''
  if (!nextModel && !nextColor) return null

  return (
    <dl className="treated-plates__specs">
      {nextModel ? (
        <div className="treated-plates__spec">
          <dt className="treated-plates__spec-label">דגם</dt>
          <dd className="treated-plates__spec-value">{nextModel}</dd>
        </div>
      ) : null}
      {nextColor ? (
        <div className="treated-plates__spec">
          <dt className="treated-plates__spec-label">צבע</dt>
          <dd className="treated-plates__spec-value">{nextColor}</dd>
        </div>
      ) : null}
    </dl>
  )
}

export function treatedPlateHasSpecs(row: Pick<TreatedPlate, 'model' | 'color'>): boolean {
  return Boolean(row.model?.trim() || row.color?.trim())
}
