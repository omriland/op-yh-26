import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { he } from 'react-day-picker/locale'
import { toLocalDateString } from '../../lib/fuelRefundReport'
import {
  RECENT_DAY_PRESETS,
  RECENT_MONTH_PRESETS,
  formatPeriodLabel,
  periodToRange,
  ymdToLocalDate,
  type PeriodValue,
} from '../../lib/periodRange'
import { useIsDesktop } from '../../lib/useMediaQuery'

const MODES: { id: PeriodValue['mode']; label: string }[] = [
  { id: 'range', label: 'טווח' },
  { id: 'month', label: 'חודש' },
  { id: 'year', label: 'שנה' },
  { id: 'recent', label: 'אחרונים' },
]

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date(2026, index, 1)),
)

type PeriodPickerProps = {
  value: PeriodValue
  onChange: (value: PeriodValue) => void
}

export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const isDesktop = useIsDesktop()
  const labelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PeriodValue['mode']>(value.mode)
  const [monthYear, setMonthYear] = useState(() => yearOf(value))
  const [draftRange, setDraftRange] = useState<DateRange | undefined>()
  const today = useMemo(() => startOfToday(), [])

  function toggleOpen() {
    if (open) {
      setOpen(false)
      return
    }
    setMode(value.mode)
    setMonthYear(yearOf(value))
    setDraftRange(toDateRange(value))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectedRange = toDateRange(value)
  const currentYear = today.getFullYear()
  const years = Array.from({ length: currentYear - 2019 }, (_, index) => currentYear - index)

  return (
    <div className="period-picker" ref={rootRef}>
      <span className="period-picker__label" id={labelId}>
        תקופה
      </span>
      <button
        type="button"
        className="period-picker__trigger"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggleOpen}
      >
        <Calendar size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="period-picker__value">{formatPeriodLabel(value)}</span>
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open ? (
        <div className="period-picker__panel" role="dialog" aria-label="בחירת תקופה">
          <div className="period-picker__modes" role="tablist" aria-label="סוג תקופה">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className="period-picker__mode"
                aria-selected={mode === item.id}
                onClick={() => {
                  setMode(item.id)
                  if (item.id === 'range') setDraftRange(toDateRange(value))
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode === 'range' ? (
            <div className="period-picker__range">
              <p className="t-caption text-muted">
                {draftRange?.from && !draftRange.to
                  ? 'בחרו תאריך סיום'
                  : 'בחרו תאריך התחלה ואז תאריך סיום'}
              </p>
              <DayPicker
                mode="range"
                locale={he}
                dir="rtl"
                resetOnSelect
                selected={draftRange}
                onSelect={(range) => {
                  setDraftRange(range)
                  if (!range?.from || !range.to) return
                  onChange({
                    mode: 'range',
                    from: toLocalDateString(range.from),
                    to: toLocalDateString(range.to),
                  })
                }}
                disabled={{ after: today }}
                numberOfMonths={isDesktop ? 2 : 1}
                defaultMonth={draftRange?.from ?? selectedRange.from}
                className="period-picker__calendar"
              />
            </div>
          ) : null}

          {mode === 'month' ? (
            <div className="period-picker__grid-wrap">
              <div className="period-picker__year-nav">
                <button
                  type="button"
                  className="period-picker__nav"
                  onClick={() => setMonthYear((year) => year - 1)}
                >
                  {monthYear - 1}
                </button>
                <span className="t-section">{monthYear}</span>
                <button
                  type="button"
                  className="period-picker__nav"
                  disabled={monthYear >= currentYear}
                  onClick={() => setMonthYear((year) => Math.min(currentYear, year + 1))}
                >
                  {monthYear + 1}
                </button>
              </div>
              <div className="period-picker__grid">
                {MONTH_LABELS.map((label, index) => {
                  const month = index + 1
                  const disabled = new Date(monthYear, index, 1) > today
                  const selected = value.mode === 'month' && value.year === monthYear && value.month === month
                  return (
                    <button
                      key={label}
                      type="button"
                      className="period-picker__cell"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => onChange({ mode: 'month', year: monthYear, month })}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {mode === 'year' ? (
            <div className="period-picker__grid period-picker__grid--years">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  className="period-picker__cell"
                  aria-pressed={value.mode === 'year' && value.year === year}
                  onClick={() => onChange({ mode: 'year', year })}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'recent' ? (
            <div className="period-picker__presets">
              {RECENT_DAY_PRESETS.map((amount) => (
                <button
                  key={`d-${amount}`}
                  type="button"
                  className="period-picker__cell"
                  aria-pressed={
                    value.mode === 'recent' && value.preset.unit === 'days' && value.preset.amount === amount
                  }
                  onClick={() => onChange({ mode: 'recent', preset: { unit: 'days', amount } })}
                >
                  {amount} ימים
                </button>
              ))}
              {RECENT_MONTH_PRESETS.map((amount) => (
                <button
                  key={`m-${amount}`}
                  type="button"
                  className="period-picker__cell"
                  aria-pressed={
                    value.mode === 'recent' &&
                    value.preset.unit === 'months' &&
                    value.preset.amount === amount
                  }
                  onClick={() => onChange({ mode: 'recent', preset: { unit: 'months', amount } })}
                >
                  {amount} חודשים
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function yearOf(value: PeriodValue): number {
  if (value.mode === 'month' || value.mode === 'year') return value.year
  const range = periodToRange(value)
  return Number(range.from.slice(0, 4))
}

function toDateRange(value: PeriodValue): DateRange {
  const range = periodToRange(value)
  return { from: ymdToLocalDate(range.from), to: ymdToLocalDate(range.to) }
}
