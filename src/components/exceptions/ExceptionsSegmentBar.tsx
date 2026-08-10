export type ExceptionsSegment = 'km' | 'duplicates'

type ExceptionsSegmentBarProps = {
  segment: ExceptionsSegment
  onChange: (segment: ExceptionsSegment) => void
}

const SEGMENTS: { id: ExceptionsSegment; label: string }[] = [
  { id: 'km', label: 'חריגי ק״מ' },
  { id: 'duplicates', label: 'אירועים כפולים' },
]

export function ExceptionsSegmentBar({ segment, onChange }: ExceptionsSegmentBarProps) {
  return (
    <div className="chips admin-segments" role="tablist" aria-label="חריגים">
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
