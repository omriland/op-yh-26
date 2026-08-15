import { formatPlate } from '../../lib/format'

function IsraelFlagMark() {
  return (
    <svg
      className="license-plate__flag"
      viewBox="0 0 22 16"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="22" height="16" fill="var(--plate-band-text)" />
      <rect y="2" width="22" height="2.2" fill="var(--plate-flag)" />
      <rect y="11.8" width="22" height="2.2" fill="var(--plate-flag)" />
      <g fill="none" stroke="var(--plate-flag)" strokeWidth="1">
        <polygon points="11,4.1 14.4,10.1 7.6,10.1" />
        <polygon points="11,11.9 7.6,5.9 14.4,5.9" />
      </g>
    </svg>
  )
}

type LicensePlateProps = {
  plate: string
}

/** Read-only Israeli civil plate mark. Profile vehicles list only. */
export function LicensePlate({ plate }: LicensePlateProps) {
  const serial = formatPlate(plate)
  if (!serial) return null

  return (
    <span className="license-plate" dir="ltr">
      <span className="license-plate__band" aria-hidden="true">
        <IsraelFlagMark />
        <span className="license-plate__il">IL</span>
      </span>
      <span className="license-plate__serial">{serial}</span>
    </span>
  )
}
