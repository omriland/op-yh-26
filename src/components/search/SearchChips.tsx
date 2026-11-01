import { X } from 'lucide-react'
import { monoClass } from '../../lib/format'
import type { SearchChip } from '../../lib/smartSearch'

/** Only the number or date part is mono — IBM Plex Mono has no Hebrew glyphs. */
function ChipLabel({ chip }: { chip: SearchChip }) {
  if (!chip.numeric) return <>{chip.label}</>
  const [, prefix, value] = /^(\D*)([\s\S]*)$/.exec(chip.label) ?? ['', '', chip.label]
  return (
    <>
      {prefix}
      <span className={monoClass(value)} dir={chip.key === 'plate' ? 'ltr' : undefined}>
        {value}
      </span>
    </>
  )
}

/** What the search understood. Neutral chips — never stamps. Without onRemove they are read-only. */
export function SearchChips({
  chips,
  onRemove,
}: {
  chips: SearchChip[]
  onRemove?: (key: SearchChip['key']) => void
}) {
  return (
    <div className="search-chips">
      <span className="t-label text-secondary">הבנתי:</span>
      <ul className="search-chips__list">
        {chips.map((chip) => (
          <li key={chip.key} className="search-chip">
            <span className="search-chip__label">
              <ChipLabel chip={chip} />
            </span>
            {onRemove ? (
              <button
                type="button"
                className="search-chip__remove"
                aria-label={`הסרת ${chip.label}`}
                onClick={() => onRemove(chip.key)}
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
