import { LicensePlate } from '../ui/LicensePlate'
import { plateDigits } from '../../lib/format'
import { treatedPlateMeta, type TreatedPlate } from '../../lib/treatedPlates'
import { CarLogo } from './CarLogo'

/** Read-only treated-plate stack (event detail + fill done). Compact plate + matched meta text. */
export function TreatedPlateStack({ plates }: { plates: TreatedPlate[] }) {
  if (plates.length === 0) return null
  return (
    <ul className="treated-plates treated-plates--stack">
      {plates.map((row) => {
        const meta = treatedPlateMeta(row)
        return (
          <li key={plateDigits(row.plate_number)} className="treated-plates__item">
            <CarLogo slug={row.logo_slug} />
            <LicensePlate plate={row.plate_number} size="sm" />
            {meta ? <span className="treated-plates__meta text-secondary">{meta}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}
