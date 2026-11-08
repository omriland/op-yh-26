import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import { VOLUNTEER_STATUS_VALUES } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import { lifecycleLabel, type StatusAudience } from '../../lib/eventLifecycle'
import { monoClass } from '../../lib/format'
import { pickAllPeople, pickPerson, type PersonAmbiguity } from '../../lib/search/personResolution'
import type { RulesVocab } from '../../lib/search/searchRules'
import { canUseArchive, type DroppedKey, type SearchRole } from '../../lib/search/searchRole'
import { jerusalemToday } from '../../lib/shifts'
import { STATUS_LIFECYCLE, chipsForFilter, removeChip, type SearchChip, type SearchChipKey } from '../../lib/smartSearch'
import { volunteerStatusLabel } from '../../lib/volunteerStatus'

/** Keys a person can add from הוספת מסנן, per role. */
type AddableKey =
  | 'dates'
  | 'road'
  | 'event_type'
  | 'district'
  | 'plate'
  | 'person'
  | 'text'
  | 'volunteer_status'
  | 'no_shift'
  | 'source'

const ADD_LABELS: Record<AddableKey, string> = {
  dates: 'תאריכים',
  road: 'כביש',
  event_type: 'סוג אירוע',
  district: 'מחוז',
  plate: 'לוחית',
  person: 'אדם',
  text: 'מילים',
  volunteer_status: 'מעמד מתנדב',
  no_shift: 'בלי משמרת',
  source: 'מקור',
}

function addableKeys(role: SearchRole): AddableKey[] {
  const keys: AddableKey[] = ['dates', 'road', 'event_type', 'district', 'plate', 'person', 'text']
  if (role !== 'responder') keys.push('volunteer_status', 'no_shift')
  if (canUseArchive(role)) keys.push('source')
  return keys
}

function hasKey(filter: SmartSearchFilter, key: AddableKey): boolean {
  switch (key) {
    case 'dates':
      return Boolean(filter.date_from || filter.date_to)
    case 'no_shift':
      return Boolean(filter.no_shift_from)
    case 'source':
      return filter.source !== 'both'
    default:
      return filter[key] !== undefined
  }
}

/** The editor a chip opens. Status, flags and the people-only switch are remove-only. */
function editorKeyFor(key: SearchChipKey): AddableKey | 'status' | null {
  if (key === 'dates' || key === 'no_shift' || key === 'status') return key
  if (key === 'location_text' || key === 'vehicle_text' || key === 'police_event_id') return null
  return (Object.keys(ADD_LABELS) as string[]).includes(key) ? (key as AddableKey) : null
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

function presets(today: string): { label: string; from: string; to: string }[] {
  const [y, m, d] = today.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const sunday = addDays(today, -dow)
  const monthStart = `${today.slice(0, 7)}-01`
  const prevMonthEnd = addDays(monthStart, -1)
  return [
    { label: 'השבוע', from: sunday, to: addDays(sunday, 6) },
    { label: 'בשבוע שעבר', from: addDays(sunday, -7), to: addDays(sunday, -1) },
    { label: 'החודש', from: monthStart, to: addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1) },
    { label: 'בחודש שעבר', from: `${prevMonthEnd.slice(0, 7)}-01`, to: prevMonthEnd },
  ]
}

function ChipText({ chip }: { chip: SearchChip }) {
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

function Options<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: ReactNode }[]
  value: T | undefined
  onPick: (value: T) => void
}) {
  return (
    <div className="search-pop__options">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="search-pop__option"
          aria-pressed={option.value === value}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function TextEditor({
  label,
  initial,
  inputMode,
  onApply,
}: {
  label: string
  initial: string
  inputMode?: 'numeric' | 'text'
  onApply: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  const id = useId()
  return (
    <form
      className="search-pop__form"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(value.trim())
      }}
    >
      <label className="search-pop__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="search-pop__input"
        value={value}
        inputMode={inputMode}
        autoFocus
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="search-pop__apply" disabled={!value.trim()}>
        החלה
      </button>
    </form>
  )
}

function RangeEditor({
  from,
  to,
  onApply,
}: {
  from?: string
  to?: string
  onApply: (from: string, to: string) => void
}) {
  const today = jerusalemToday()
  const [start, setStart] = useState(from ?? today)
  const [end, setEnd] = useState(to ?? from ?? today)
  const fromId = useId()
  const toId = useId()
  return (
    <div className="stack-3">
      <div className="search-pop__options">
        {presets(today).map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="search-pop__option"
            aria-pressed={preset.from === from && preset.to === to}
            onClick={() => onApply(preset.from, preset.to)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <form
        className="search-pop__form"
        onSubmit={(event) => {
          event.preventDefault()
          onApply(start <= end ? start : end, start <= end ? end : start)
        }}
      >
        <label className="search-pop__label" htmlFor={fromId}>
          מ־
        </label>
        <input id={fromId} className="search-pop__input mono" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <label className="search-pop__label" htmlFor={toId}>
          עד
        </label>
        <input id={toId} className="search-pop__input mono" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button type="submit" className="search-pop__apply" disabled={!start || !end}>
          החלה
        </button>
      </form>
    </div>
  )
}

export type SearchFilterBarProps = {
  filter: SmartSearchFilter
  role: SearchRole
  audience: StatusAudience
  vocab: RulesVocab
  ambiguity: PersonAmbiguity | null
  dropped: DroppedKey[]
  /** Every edit, removal or pick; `removed` is set when a chip was taken away. */
  onChange: (next: SmartSearchFilter, change: { removed?: SearchChipKey }) => void
  disabled?: boolean
  /** Opens הוספת מסנן from outside (the parse-failure notice). */
  addRequest?: number
}

/**
 * הבנתי: what the search understood, as chips that can be edited, removed or added
 * to. A name with several matches is an amber chip with a picker; a key the role
 * cannot use is a dashed chip that says why.
 */
export function SearchFilterBar({
  filter,
  role,
  audience,
  vocab,
  ambiguity,
  dropped,
  onChange,
  disabled = false,
  addRequest = 0,
}: SearchFilterBarProps) {
  const [open, setOpen] = useState<AddableKey | 'status' | 'add' | null>(null)
  const popId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const chips = chipsForFilter(filter, audience).filter((chip) => canUseArchive(role) || chip.key !== 'source')
  const isAmbiguous = Boolean(ambiguity && (filter.person_ids?.length ?? 0) > 1)

  useEffect(() => {
    if (addRequest > 0) setOpen('add')
  }, [addRequest])

  function close(refocus = true) {
    setOpen(null)
    if (refocus) returnFocus.current?.focus()
  }

  function apply(next: SmartSearchFilter) {
    onChange(next, {})
    close()
  }

  function toggle(key: AddableKey | 'status' | 'add', button: HTMLButtonElement) {
    returnFocus.current = button
    setOpen((current) => (current === key ? null : key))
  }

  function editor(key: AddableKey | 'status'): ReactNode {
    switch (key) {
      case 'dates':
        return (
          <RangeEditor
            from={filter.date_from}
            to={filter.date_to}
            onApply={(from, to) => apply({ ...filter, date_from: from, date_to: to })}
          />
        )
      case 'no_shift':
        return (
          <RangeEditor
            from={filter.no_shift_from}
            to={filter.no_shift_to}
            onApply={(from, to) => apply({ ...filter, entity: 'people', no_shift_from: from, no_shift_to: to })}
          />
        )
      case 'road':
        return <TextEditor label="מספר כביש" initial={filter.road ?? ''} inputMode="numeric" onApply={(v) => apply({ ...filter, road: v })} />
      case 'plate':
        return (
          <TextEditor
            label="מספר לוחית"
            initial={filter.plate ?? ''}
            inputMode="numeric"
            onApply={(v) => {
              const digits = v.replace(/\D/g, '')
              if (digits.length >= 3) apply({ ...filter, plate: digits })
            }}
          />
        )
      case 'text':
        return <TextEditor label="מילים לחיפוש" initial={filter.text ?? ''} onApply={(v) => apply({ ...filter, text: v })} />
      case 'person':
        if (ambiguity) {
          return (
            <div className="stack-2">
              <p className="search-pop__title">למי התכוונת?</p>
              <Options
                options={[
                  ...ambiguity.candidates.map((person) => ({
                    value: person.id,
                    label: (
                      <>
                        {person.full_name} · או״ק <span className={monoClass(person.callsign)}>{person.callsign}</span>
                      </>
                    ),
                  })),
                  { value: '__all__', label: `כל ה״${ambiguity.name}״ (${ambiguity.candidates.length})` },
                ]}
                value={isAmbiguous ? '__all__' : filter.person_ids?.[0]}
                onPick={(value) => {
                  const person = ambiguity.candidates.find((p) => p.id === value)
                  apply(person ? pickPerson(filter, person, role) : pickAllPeople(filter, ambiguity, role))
                }}
              />
            </div>
          )
        }
        return (
          <TextEditor
            label="שם או או״ק"
            initial={filter.person ?? ''}
            onApply={(v) => {
              const next = { ...filter, person: v }
              delete next.person_ids
              delete next.person_callsigns
              apply(next)
            }}
          />
        )
      case 'event_type':
        return vocab.eventTypes.length > 0 ? (
          <Options
            options={vocab.eventTypes.map((name) => ({ value: name, label: name }))}
            value={filter.event_type}
            onPick={(v) => apply({ ...filter, event_type: v })}
          />
        ) : (
          <p className="t-caption text-muted">טעינת סוגי האירוע נכשלה. רעננו את הדף ונסו שוב.</p>
        )
      case 'district':
        return vocab.districts.length > 0 ? (
          <Options
            options={vocab.districts.map((name) => ({ value: name, label: name }))}
            value={filter.district}
            onPick={(v) => apply({ ...filter, district: v })}
          />
        ) : (
          <p className="t-caption text-muted">טעינת המחוזות נכשלה. רעננו את הדף ונסו שוב.</p>
        )
      case 'volunteer_status':
        return (
          <Options
            options={VOLUNTEER_STATUS_VALUES.map((value) => ({ value, label: volunteerStatusLabel(value) }))}
            value={filter.volunteer_status}
            onPick={(v) => apply({ ...filter, entity: 'people', volunteer_status: v })}
          />
        )
      case 'source':
        return (
          <Options
            options={[
              { value: 'both' as const, label: 'אירועים חדשים וארכיון' },
              { value: 'new' as const, label: 'אירועים חדשים בלבד' },
              { value: 'archive' as const, label: 'ארכיון בלבד' },
            ]}
            value={filter.source}
            onPick={(v) => apply({ ...filter, source: v })}
          />
        )
      case 'status':
        return (
          <Options
            options={(Object.keys(STATUS_LIFECYCLE) as (keyof typeof STATUS_LIFECYCLE)[])
              .filter((stored) => audience === 'lead' || stored !== 'draft')
              .map((stored) => ({ value: stored, label: lifecycleLabel(STATUS_LIFECYCLE[stored], audience) }))}
            value={filter.status}
            onPick={(v) => apply({ ...filter, status: v })}
          />
        )
    }
  }

  const openTitle = open === 'add' ? 'הוספת מסנן' : open ? ADD_LABELS[open as AddableKey] ?? 'סטטוס' : ''

  return (
    <div
      ref={rootRef}
      className="search-filters"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <div className="search-chips">
        <span className="t-label text-secondary">הבנתי:</span>
        <ul className="search-chips__list">
          {chips.map((chip) => {
            const editKey = editorKeyFor(chip.key)
            const amber = chip.key === 'person' && isAmbiguous
            const label =
              amber && ambiguity ? `אדם: ${ambiguity.name} (${ambiguity.candidates.length} אנשים)` : null
            return (
              <li key={chip.key} className={['search-chip', amber ? 'search-chip--ask' : ''].filter(Boolean).join(' ')}>
                {editKey && !disabled ? (
                  <button
                    type="button"
                    className="search-chip__edit"
                    aria-expanded={open === editKey}
                    aria-controls={open === editKey ? popId : undefined}
                    onClick={(event) => toggle(editKey, event.currentTarget)}
                  >
                    {label ?? <ChipText chip={chip} />}
                  </button>
                ) : (
                  <span className="search-chip__label">{label ?? <ChipText chip={chip} />}</span>
                )}
                {!disabled ? (
                  <button
                    type="button"
                    className="search-chip__remove"
                    aria-label={`הסרת ${label ?? chip.label}`}
                    onClick={() => {
                      setOpen(null)
                      onChange(removeChip(filter, chip.key), { removed: chip.key })
                    }}
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            )
          })}
          {dropped.map((item) => (
            <li key={item.key} className="search-chip search-chip--off" aria-disabled="true">
              <span className="search-chip__label">
                {item.key === 'no_shift' ? 'בלי משמרת' : 'מעמד מתנדב'}
                <span className="visually-hidden">: {item.reason}</span>
              </span>
            </li>
          ))}
          {!disabled ? (
            <li>
              <button
                type="button"
                className="search-chip search-chip--add"
                aria-expanded={open === 'add'}
                aria-controls={open === 'add' ? popId : undefined}
                onClick={(event) => toggle('add', event.currentTarget)}
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                הוספת מסנן
              </button>
            </li>
          ) : null}
        </ul>
      </div>
      {dropped.length > 0 ? (
        <p className="t-caption text-muted search-filters__note">{dropped.map((item) => item.reason).join('. ')}.</p>
      ) : null}
      {open ? (
        <div id={popId} className="search-pop" role="group" aria-label={openTitle}>
          <div className="search-pop__head">
            <p className="search-pop__title">{openTitle}</p>
            <button type="button" className="search-pop__close" aria-label="סגירה" onClick={() => close()}>
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {open === 'add' ? (
            <div className="search-pop__options">
              {addableKeys(role).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="search-pop__option"
                  aria-pressed={hasKey(filter, key)}
                  onClick={() => setOpen(key)}
                >
                  {ADD_LABELS[key]}
                </button>
              ))}
            </div>
          ) : (
            editor(open)
          )}
        </div>
      ) : null}
    </div>
  )
}
