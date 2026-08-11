export type FuelRefundSegment = 'summary' | 'detail'

type FuelRefundSegmentBarProps = {
  segment: FuelRefundSegment
  onChange: (segment: FuelRefundSegment) => void
}

const SEGMENTS: { id: FuelRefundSegment; label: string }[] = [
  { id: 'summary', label: 'סיכום' },
  { id: 'detail', label: 'פירוט' },
]

export function FuelRefundSegmentBar({ segment, onChange }: FuelRefundSegmentBarProps) {
  return (
    <div className="chips admin-segments" role="tablist" aria-label="החזר דלק">
      {SEGMENTS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className="chip"
          aria-selected={segment === item.id}
          aria-pressed={segment === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
