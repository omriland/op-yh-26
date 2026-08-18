import { LicensePlate } from '../ui/LicensePlate'
import { plateDigits } from '../../lib/format'
import { type TreatedPlate } from '../../lib/treatedPlates'
import { CarLogo } from './CarLogo'
import { TreatedPlateSpecs, treatedPlateHasSpecs } from './TreatedPlateSpecs'

/** Read-only treated-plate stack (event detail + fill done). */
export function TreatedPlateStack({ plates }: { plates: TreatedPlate[] }) {
  if (plates.length === 0) return null
  return (
    <ul className="treated-plates treated-plates--stack">
      {plates.map((row) => {
        const leftWhere = row.left_where?.trim() || null
        return (
          <li key={plateDigits(row.plate_number)} className="treated-plates__item">
            <article className="treated-plates__card treated-plates__card--read">
              <header className="treated-plates__head">
                <div className="treated-plates__identity">
                  <CarLogo slug={row.logo_slug} />
                  <LicensePlate plate={row.plate_number} size="sm" />
                </div>
              </header>
              {treatedPlateHasSpecs(row) ? (
                <TreatedPlateSpecs model={row.model} color={row.color} />
              ) : null}
              {leftWhere ? (
                <p className="treated-plates__where text-secondary t-body">
                  <span className="treated-plates__where-label">הושאר ב־</span>
                  {leftWhere}
                </p>
              ) : null}
            </article>
          </li>
        )
      })}
    </ul>
  )
}
