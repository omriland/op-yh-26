import type { ReactNode } from 'react'
import { odometerEndReading } from '../../lib/odometer'

/** End odometer, with the responder's trip as `(6 ק״מ סה״כ)` when both readings exist. */
export function odometerEndValue(
  start: number | null | undefined,
  end: number | null | undefined,
): ReactNode {
  const parts = odometerEndReading(start, end)
  if (!parts) return undefined
  if (parts.trip == null) return <span className="mono">{parts.end}</span>
  return (
    <>
      <span className="mono">{parts.end}</span>
      {' ('}
      <span className="mono">{parts.trip}</span>
      {' ק״מ סה״כ)'}
    </>
  )
}
