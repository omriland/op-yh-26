import { useState } from 'react'

type CarLogoProps = {
  slug: string | null | undefined
  className?: string
}

/** Small manufacturer mark before a treated plate. Omits on miss / load error. */
export function CarLogo({ slug, className }: CarLogoProps) {
  const [failed, setFailed] = useState(false)
  const trimmed = slug?.trim() || null
  if (!trimmed || failed) return null

  return (
    <img
      className={['car-logo', className].filter(Boolean).join(' ')}
      src={`/car-logos/${encodeURIComponent(trimmed)}.png`}
      alt=""
      width={28}
      height={28}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
