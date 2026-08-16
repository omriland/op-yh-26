import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type MineShiftEventGroupProps = {
  title: string
  eventCount: number
  children: ReactNode
}

export function MineShiftEventGroup({
  title,
  eventCount,
  children,
}: MineShiftEventGroupProps) {
  const [open, setOpen] = useState(false)

  return (
    <li className={['card', 'stack-3', open ? 'assignment-card--open' : ''].join(' ')}>
      <div className="assignment-card__head">
        <button
          type="button"
          className="assignment-card__toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="assignment-card__identity">
            <span className="t-label text-secondary">{title}</span>
            <span className="t-body text-secondary">{`${eventCount} אירועים`}</span>
          </span>
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            className={['assignment-card__chevron', open ? 'is-rotated' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? <ul className="assignment-card__body stack-3">{children}</ul> : null}
    </li>
  )
}
