import { ADMIN_SEGMENTS, type AdminSegment } from '../../lib/adminSegments'

type AdminSegmentBarProps = {
  view: AdminSegment
  onChange: (view: AdminSegment) => void
}

export function AdminSegmentBar({ view, onChange }: AdminSegmentBarProps) {
  return (
    <div className="chips admin-segments" role="tablist" aria-label="ניהול">
      {ADMIN_SEGMENTS.map((segment) => (
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
