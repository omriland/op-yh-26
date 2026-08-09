type AdminSegment = 'users' | 'lists'

type AdminSegmentBarProps = {
  view: AdminSegment
  onChange: (view: AdminSegment) => void
}

export function AdminSegmentBar({ view, onChange }: AdminSegmentBarProps) {
  return (
    <div className="chips admin-segments" role="tablist" aria-label="ניהול">
      <button
        type="button"
        role="tab"
        className="chip"
        aria-selected={view === 'users'}
        aria-pressed={view === 'users'}
        onClick={() => onChange('users')}
      >
        משתמשים
      </button>
      <button
        type="button"
        role="tab"
        className="chip"
        aria-selected={view === 'lists'}
        aria-pressed={view === 'lists'}
        onClick={() => onChange('lists')}
      >
        הגדרות
      </button>
    </div>
  )
}
