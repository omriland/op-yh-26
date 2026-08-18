import { LicensePlate } from '../ui/LicensePlate'
import { plateDigits } from '../../lib/format'
import { treatedPlateCaption, type TreatedPlate } from '../../lib/treatedPlates'

export function TreatedPlateStack({ plates }: { plates: TreatedPlate[] }) {
  if (plates.length === 0) return null
  return (
    <ul className="treated-plates">
      {plates.map((row) => (
        <li key={plateDigits(row.plate_number)} className="treated-plates__item">
          <LicensePlate plate={row.plate_number} />
          {treatedPlateCaption(row.model, row.color) ? (
            <span className="treated-plates__caption t-caption text-secondary">
              {treatedPlateCaption(row.model, row.color)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
