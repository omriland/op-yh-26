import { Copy } from 'lucide-react'
import { IconButton } from '../ui/Button'
import { formatLocationCoords, locationPinIsLocked } from '../../lib/locationPin'
import type { LocationPinSource } from '../../lib/locationPin'

type LocationCoordsFieldProps = {
  lat: number
  lng: number
  source: LocationPinSource | null
  onCopy: () => void
  onResetToGoogle?: () => void
}

export function LocationCoordsField({
  lat,
  lng,
  source,
  onCopy,
  onResetToGoogle,
}: LocationCoordsFieldProps) {
  const locked = locationPinIsLocked(source)
  const value = formatLocationCoords(lat, lng)

  return (
    <div className="location-coords">
      <p className="field__label">קואורדינטות</p>
      <div className="location-coords__row">
        <div className="location-coords__pin">
          <span className="location-coords__value mono" dir="ltr">
            {value}
          </span>
          <IconButton label="העתקת קואורדינטות" onClick={onCopy}>
            <Copy size={20} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>
        {locked && onResetToGoogle ? (
          <button type="button" className="btn btn--ghost location-coords__reset" onClick={onResetToGoogle}>
            חזרה למיקום מגוגל
          </button>
        ) : null}
      </div>
    </div>
  )
}
