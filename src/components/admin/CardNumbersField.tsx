import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  canAddCardNumber,
  parseCardNumbers,
  serializeCardNumbers,
} from '../../lib/fuelQuarterCards'
import { formatNumber } from '../../lib/format'

type CardNumbersFieldProps = {
  cards: number
  value: string
  disabled?: boolean
  label?: string
  /** Dense table cell: fixed-height trigger + hover panel for manage. */
  compact?: boolean
  onChange: (next: string) => void
}

const CLOSE_DELAY_MS = 220

export function CardNumbersField({
  cards,
  value,
  disabled,
  label = 'מספרי כרטיסים',
  compact = false,
  onChange,
}: CardNumbersFieldProps) {
  const numbers = parseCardNumbers(value)
  const [draft, setDraft] = useState('')
  const match = numbers.length === cards
  const full = numbers.length >= cards

  function commitDraft() {
    if (!canAddCardNumber(numbers, cards, draft)) return
    const next = [...numbers, draft.trim()]
    onChange(serializeCardNumbers(next))
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commitDraft()
  }

  function removeAt(index: number) {
    const next = numbers.filter((_, i) => i !== index)
    onChange(serializeCardNumbers(next))
  }

  if (compact) {
    return (
      <CardNumbersHoverCell
        cards={cards}
        numbers={numbers}
        match={match}
        full={full}
        disabled={disabled}
        label={label}
        draft={draft}
        setDraft={setDraft}
        onKeyDown={onKeyDown}
        onRemoveAt={removeAt}
      />
    )
  }

  return (
    <div className="stack-2">
      <div className="row-between" style={{ gap: 'var(--space-2)' }}>
        <span className="t-caption text-muted">{label}</span>
        <span
          className={`t-caption mono ${match ? 'text-muted' : 'text-danger'}`}
          aria-live="polite"
        >
          {formatNumber(numbers.length)}/{formatNumber(cards)}
        </span>
      </div>
      {numbers.length > 0 ? (
        <div className="tags">
          {numbers.map((num, index) => (
            <span key={`${num}-${index}`} className="tag">
              <span className="mono">{num}</span>
              {!disabled ? (
                <button
                  type="button"
                  className="table-edit__remove"
                  aria-label={`הסרת כרטיס ${num}`}
                  onClick={() => removeAt(index)}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {!disabled && cards > 0 && !full ? (
        <input
          className="field__input mono"
          type="text"
          value={draft}
          placeholder="מספר כרטיס + Enter"
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : null}
      {!disabled && cards === 0 ? (
        <p className="t-caption text-muted">אין כרטיסים לשורה זו</p>
      ) : null}
    </div>
  )
}

type HoverCellProps = {
  cards: number
  numbers: string[]
  match: boolean
  full: boolean
  disabled?: boolean
  label: string
  draft: string
  setDraft: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onRemoveAt: (index: number) => void
}

function CardNumbersHoverCell({
  cards,
  numbers,
  match,
  full,
  disabled,
  label,
  draft,
  setDraft,
  onKeyDown,
  onRemoveAt,
}: HoverCellProps) {
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const closeTimer = useRef<number | null>(null)

  function cancelClose() {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }

  function openPanel() {
    cancelClose()
    setOpen(true)
  }

  function updateCoords() {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(240, rect.width)
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
    )
    const below = rect.bottom + 6
    const panelApproxHeight = 160
    const top =
      below + panelApproxHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - panelApproxHeight - 6)
        : below
    setCoords({ top, left, width })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
  }, [open, numbers.length, cards])

  useEffect(() => {
    if (!open) return
    function onReposition() {
      updateCoords()
    }
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open])

  useEffect(() => {
    return () => cancelClose()
  }, [])

  const summary =
    numbers.length === 0 ? null : numbers.length <= 2 ? numbers.join(' · ') : `${numbers[0]} · +${formatNumber(numbers.length - 1)}`

  const panel =
    open && coords ? (
      <div
        id={panelId}
        className="card-numbers-panel"
        role="dialog"
        aria-label={label}
        style={{ top: coords.top, left: coords.left, width: coords.width }}
        onPointerEnter={openPanel}
        onPointerLeave={scheduleClose}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
            triggerRef.current?.focus()
          }
        }}
      >
        <div className="card-numbers-panel__head">
          <span className="t-caption text-muted">{label}</span>
          <span className={`t-caption mono ${match ? 'text-muted' : 'text-danger'}`}>
            {formatNumber(numbers.length)}/{formatNumber(cards)}
          </span>
        </div>
        {numbers.length > 0 ? (
          <div className="tags tags--compact">
            {numbers.map((num, index) => (
              <span key={`${num}-${index}`} className="tag tag--compact">
                <span className="mono">{num}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="table-edit__remove"
                    aria-label={`הסרת כרטיס ${num}`}
                    onClick={() => onRemoveAt(index)}
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <p className="t-caption text-muted">אין מספרי כרטיסים עדיין</p>
        )}
        {!disabled && cards > 0 && !full ? (
          <input
            className="table-input mono"
            type="text"
            value={draft}
            placeholder="מספר כרטיס + Enter"
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
        ) : null}
      </div>
    ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[
          'card-numbers-trigger',
          'mono',
          match ? 'text-muted' : 'text-danger',
        ].join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${label}: ${formatNumber(numbers.length)} מתוך ${formatNumber(cards)}`}
        onPointerEnter={openPanel}
        onPointerLeave={scheduleClose}
        onClick={openPanel}
      >
        <span className="card-numbers-trigger__count">
          {formatNumber(numbers.length)}/{formatNumber(cards)}
        </span>
        {summary ? <span className="card-numbers-trigger__preview">{summary}</span> : null}
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </>
  )
}
