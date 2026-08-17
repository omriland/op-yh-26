import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type MineShiftEventGroupProps = {
  title: string
  caption: string
  defaultOpen?: boolean
  children: ReactNode
}

export function MineShiftEventGroup({
  title,
  caption,
  defaultOpen = false,
  children,
}: MineShiftEventGroupProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <li className={['mine-shift-group', 'stack-3', open ? 'mine-shift-group--open' : ''].join(' ')}>
      <div className="mine-shift-group__head">
        <button
          type="button"
          className="mine-shift-group__toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="mine-shift-group__identity">
            <span className="t-label text-secondary">{title}</span>
            <span className="t-body text-secondary">{caption}</span>
          </span>
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            className={['mine-shift-group__chevron', open ? 'is-rotated' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? <ul className="mine-shift-group__body stack-3">{children}</ul> : null}
    </li>
  )
}
