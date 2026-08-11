type AdminSegment = 'users' | 'fuel_refund' | 'fuel_quarter' | 'lists'

type AdminSegmentBarProps = {
  view: AdminSegment
  onChange: (view: AdminSegment) => void
}

const SEGMENTS: { id: AdminSegment; label: string }[] = [
  { id: 'users', label: 'משתמשים' },
  { id: 'fuel_refund', label: 'טבלה מסכמת' },
  { id: 'fuel_quarter', label: 'דרישת דלק' },
  { id: 'lists', label: 'הגדרות' },
]

export function AdminSegmentBar({ view, onChange }: AdminSegmentBarProps) {
  return (
    <div className="chips admin-segments" role="tablist" aria-label="ניהול">
      {SEGMENTS.map((segment) => (
        <button
          key={segment.id}
          type="button"
          role="tab"
          className="chip"
          aria-selected={view === segment.id}
          aria-pressed={view === segment.id}
          onClick={() => onChange(segment.id)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  )
}
