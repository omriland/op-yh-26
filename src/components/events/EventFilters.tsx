import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  Hash,
  LayoutList,
  Plus,
  RectangleHorizontal,
  Save,
  Search,
  Trash2,
  Truck,
  UserRound,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import {
  DEFAULT_EVENT_LIST_VIEW,
  FILTER_FIELDS,
  PERIOD_LABELS,
  activeRules,
  emptyRule,
  fieldDef,
  periodState,
  ruleError,
  ruleSummary,
  ruleValueLabel,
  sameView,
  withPeriodWindow,
  type DateRule,
  type EventListView,
  type FilterField,
  type FilterRule,
} from '../../lib/eventFilters'
import type { FilterLookups } from '../../lib/eventFiltersApi'
import {
  DEFAULT_PRESET_ID,
  DEFAULT_PRESET_NAME,
  DuplicatePresetNameError,
  PRESET_NAME_MAX,
  presetNameError,
  type EventFilterPreset,
} from '../../lib/eventFilterPresets'
import { digitsOnly, policeEventIdForInput } from '../../lib/format'
import { EVENT_FILTERS } from '../../lib/status'
import { AlertDialog } from '../ui/AlertDialog'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { DateField } from '../ui/DateField'
import { Dialog } from '../ui/Dialog'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { FilterPopover } from './FilterPopover'

export type EventFiltersApi = {
  fetchFilterLookups: () => Promise<FilterLookups>
  listPresets: (userId: string) => Promise<EventFilterPreset[]>
  savePreset: (userId: string, name: string, view: EventListView) => Promise<EventFilterPreset>
  deletePreset: (userId: string, id: string) => Promise<void>
}

type EventFiltersProps = {
  view: EventListView
  onViewChange: (view: EventListView) => void
  query: string
  onQueryChange: (query: string) => void
  /** אחמ״ש gets the 12-hour list by default. */
  shiftLeadList: boolean
  /** אחמ״ש who is not admin: the נוצרו על ידי אחרים toggle. */
  showOthersControl: boolean
  /** What ברירת מחדל shows this viewer, for the view menu. */
  defaultCaption: string
  userId: string | undefined
  api: EventFiltersApi
}

const UNSAVED_ID = 'unsaved'
const TEXT_DEBOUNCE_MS = 300

const FIELD_ICONS: Record<FilterField, ReactNode> = {
  shift_lead: <UserRoundCheck size={16} strokeWidth={1.75} aria-hidden="true" />,
  responder: <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />,
  event_id: <Hash size={16} strokeWidth={1.75} aria-hidden="true" />,
  event_date: <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />,
  treated_plate: <RectangleHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />,
  vehicle_kind: <Car size={16} strokeWidth={1.75} aria-hidden="true" />,
}

const STATUS_DOT: Record<string, string> = {
  all: 'var(--text-secondary)',
  draft: 'var(--status-draft)',
  in_progress: 'var(--status-pending)',
  partial: 'var(--status-partial)',
  done: 'var(--status-done)',
}

const STATUS_ALL_LABEL = 'כל הסטטוסים'

/** Pill fields: everything but the date, which the תקופה pill owns. */
const PILL_FIELDS = FILTER_FIELDS.filter((def) => def.field !== 'event_date')

function isEmptyRule(rule: FilterRule): boolean {
  switch (rule.field) {
    case 'shift_lead':
    case 'vehicle_kind':
      return rule.value.length === 0
    case 'event_date':
      return !rule.value.from && !rule.value.to
    default:
      return rule.value.trim() === ''
  }
}

export function EventFilters({
  view,
  onViewChange,
  query,
  onQueryChange,
  shiftLeadList,
  showOthersControl,
  defaultCaption,
  userId,
  api,
}: EventFiltersProps) {
  const { show } = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<FilterRule[]>(() => view.rules)
  const [presets, setPresets] = useState<EventFilterPreset[]>([])
  const [lookups, setLookups] = useState<FilterLookups | null>(null)
  const [lookupsFailed, setLookupsFailed] = useState(false)
  const [lookupsRequested, setLookupsRequested] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EventFilterPreset | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmSwitch, setConfirmSwitch] = useState<EventListView | null>(null)
  const pillRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const addRef = useRef<HTMLButtonElement | null>(null)
  const saveNameRef = useRef<HTMLInputElement | null>(null)
  const timers = useRef(new Map<FilterField, number>())
  const viewRef = useRef(view)
  viewRef.current = view

  // Applied rules changed: drafts take the applied values and gain any new field. Drafts
  // leave only by an explicit remove, view switch or ניקוי סינון, so a withheld date stays.
  const appliedKey = JSON.stringify(view.rules)
  const appliedRules = useMemo(() => JSON.parse(appliedKey) as FilterRule[], [appliedKey])
  useEffect(() => {
    setDrafts((prev) => {
      const applied = new Map(appliedRules.map((rule) => [rule.field, rule]))
      const kept = prev.map((draft) =>
        ruleError(draft) === null ? (applied.get(draft.field) ?? draft) : draft,
      )
      const added = appliedRules.filter((rule) => !kept.some((draft) => draft.field === rule.field))
      return [...kept, ...added]
    })
  }, [appliedRules])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((handle) => window.clearTimeout(handle))
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    api
      .listPresets(userId)
      .then((rows) => {
        if (active) setPresets(rows)
      })
      .catch(() => {
        if (active) show('טעינת התצוגות השמורות נכשלה. בדקו את החיבור ונסו שוב.', 'alert')
      })
    return () => {
      active = false
    }
  }, [api, show, userId])

  const needsLookups =
    (openId?.startsWith('rule:') ?? false) ||
    drafts.some((rule) => rule.field === 'shift_lead' || rule.field === 'vehicle_kind')
  useEffect(() => {
    if (needsLookups) setLookupsRequested(true)
  }, [needsLookups])

  const loadLookups = useCallback(() => {
    setLookupsFailed(false)
    api
      .fetchFilterLookups()
      .then(setLookups)
      .catch(() => setLookupsFailed(true))
  }, [api])

  useEffect(() => {
    if (lookupsRequested) loadLookups()
  }, [loadLookups, lookupsRequested])

  const labels = useMemo(
    () => ({
      shiftLeads: new Map(lookups?.shiftLeads.map((row) => [row.id, row.label])),
      vehicleKinds: new Map(lookups?.vehicleKinds.map((row) => [row.id, row.label])),
    }),
    [lookups],
  )

  const currentId = sameView(view, DEFAULT_EVENT_LIST_VIEW)
    ? DEFAULT_PRESET_ID
    : (presets.find((preset) => sameView(view, preset.view))?.id ?? UNSAVED_ID)
  const currentPreset = presets.find((preset) => preset.id === currentId) ?? null
  const currentName =
    currentId === DEFAULT_PRESET_ID
      ? DEFAULT_PRESET_NAME
      : (currentPreset?.name ?? 'סינון שלא נשמר')
  const period = periodState(view, shiftLeadList)
  const hasLeadRule = drafts.some((rule) => rule.field === 'shift_lead' && !isEmptyRule(rule))
  const anythingSet = currentId !== DEFAULT_PRESET_ID || query.trim() !== ''

  /** Applies one field: a complete rule, or none when emptied. A half-typed value leaves the list as it is. */
  function pushRule(field: FilterField, draft: FilterRule | null) {
    const current = viewRef.current
    const others = current.rules.filter((rule) => rule.field !== field)
    let next: FilterRule[]
    if (!draft || isEmptyRule(draft)) next = others
    else if (ruleError(draft) === null) next = [...others, draft]
    else return
    const rules = activeRules(next)
    if (JSON.stringify(rules) === JSON.stringify(activeRules(current.rules))) return
    onViewChange({ ...current, rules })
  }

  function editDraft(next: FilterRule, debounce = false, hold = false) {
    setDrafts((rows) =>
      rows.some((row) => row.field === next.field)
        ? rows.map((row) => (row.field === next.field ? next : row))
        : [...rows, next],
    )
    window.clearTimeout(timers.current.get(next.field))
    if (hold) return
    if (!debounce) {
      pushRule(next.field, next)
      return
    }
    timers.current.set(
      next.field,
      window.setTimeout(() => pushRule(next.field, next), TEXT_DEBOUNCE_MS),
    )
  }

  function addField(field: FilterField) {
    setDrafts((rows) => (rows.some((row) => row.field === field) ? rows : [...rows, emptyRule(field)]))
    setOpenId(`rule:${field}`)
  }

  function removeField(field: FilterField) {
    window.clearTimeout(timers.current.get(field))
    const order: FilterField[] = drafts.filter((row) => row.field !== 'event_date').map((row) => row.field)
    const index = order.indexOf(field)
    const nextFocus = order[index + 1] ?? order[index - 1]
    setDrafts((rows) => rows.filter((row) => row.field !== field))
    setOpenId(null)
    pushRule(field, null)
    window.setTimeout(() => {
      const target = nextFocus ? pillRefs.current.get(nextFocus) : null
      ;(target ?? addRef.current)?.focus()
    }, 0)
  }

  function chooseView(next: EventListView) {
    setOpenId(null)
    if (currentId === UNSAVED_ID && !sameView(next, view)) {
      setConfirmSwitch(next)
      return
    }
    switchTo(next)
  }

  function switchTo(next: EventListView) {
    timers.current.forEach((handle) => window.clearTimeout(handle))
    setDrafts(next.rules)
    onViewChange(next)
  }

  function clearAll() {
    switchTo(DEFAULT_EVENT_LIST_VIEW)
    onQueryChange('')
  }

  function openSave() {
    setOpenId(null)
    setSaveName('')
    setSaveError(null)
    setSaveOpen(true)
    window.setTimeout(() => saveNameRef.current?.focus(), 50)
  }

  async function submitSave() {
    if (!userId) return
    const error = presetNameError(saveName, presets)
    if (error) {
      setSaveError(error)
      saveNameRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const saved = await api.savePreset(userId, saveName, view)
      setPresets((rows) => [...rows, saved].sort((a, b) => a.name.localeCompare(b.name, 'he')))
      setSaveOpen(false)
      show('התצוגה נשמרה', 'done')
    } catch (error) {
      setSaveError(
        error instanceof DuplicatePresetNameError
          ? error.message
          : 'שמירת התצוגה נכשלה. בדקו את החיבור ונסו שוב.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function submitDelete() {
    if (!userId || !confirmDelete) return
    setDeleting(true)
    try {
      await api.deletePreset(userId, confirmDelete.id)
      setPresets((rows) => rows.filter((row) => row.id !== confirmDelete.id))
      setConfirmDelete(null)
      show('התצוגה נמחקה', 'done')
    } catch {
      show('מחיקת התצוגה נכשלה. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setDeleting(false)
    }
  }

  const toggle = (id: string) => setOpenId((open) => (open === id ? null : id))
  const close = () => setOpenId(null)
  const pills = drafts.filter((rule) => rule.field !== 'event_date')
  const unused = PILL_FIELDS.filter((def) => !drafts.some((rule) => rule.field === def.field))
  const dateDraft = drafts.find((rule): rule is DateRule => rule.field === 'event_date')
  const statusRow = EVENT_FILTERS.find((row) => row.value === view.status)
  const otherRules = activeRules(view.rules).some((rule) => rule.field !== 'event_date')

  return (
    <div className="efilters">
      <div className="efilters__view">
        <span className="efilters__view-label">תצוגה:</span>
        <FilterPopover
          open={openId === 'view'}
          onClose={close}
          title="תצוגה"
          kind="menu"
          trigger={
            <button
              type="button"
              className="fview"
              aria-haspopup="menu"
              aria-expanded={openId === 'view'}
              onClick={() => toggle('view')}
            >
              <LayoutList size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="fview__name">{currentName}</span>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          }
        >
          <MenuItem
            role="menuitemradio"
            checked={currentId === DEFAULT_PRESET_ID}
            icon={<LayoutList size={16} strokeWidth={1.75} aria-hidden="true" />}
            label={DEFAULT_PRESET_NAME}
            description={defaultCaption}
            onSelect={() => chooseView(DEFAULT_EVENT_LIST_VIEW)}
          />
          {presets.map((preset) => (
            <MenuItem
              key={preset.id}
              role="menuitemradio"
              checked={currentId === preset.id}
              icon={<LayoutList size={16} strokeWidth={1.75} aria-hidden="true" />}
              label={preset.name}
              onSelect={() => chooseView(preset.view)}
            />
          ))}
          {presets.length === 0 ? (
            <p className="fpop__note">אין עדיין תצוגות שמורות. הגדירו סינון ושמרו אותו כתצוגה.</p>
          ) : null}
          {userId && (currentId === UNSAVED_ID || currentPreset) ? <hr className="fpop__divider" /> : null}
          {userId && currentId === UNSAVED_ID ? (
            <MenuItem
              icon={<Plus size={16} strokeWidth={1.75} aria-hidden="true" />}
              label="שמירה כתצוגה חדשה"
              onSelect={openSave}
            />
          ) : null}
          {currentPreset ? (
            <MenuItem
              danger
              icon={<Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />}
              label={`מחיקת התצוגה ״${currentPreset.name}״`}
              onSelect={() => {
                setOpenId(null)
                setConfirmDelete(currentPreset)
              }}
            />
          ) : null}
        </FilterPopover>
      </div>

      <div className="efilters__row">
        <label className="fsearch">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">חיפוש אירועים לפי מספר אירוע, כביש, מיקום או שם</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="חיפוש לסינון"
          />
          {query ? (
            <button
              type="button"
              className="fsearch__clear"
              aria-label="ניקוי החיפוש"
              onClick={() => onQueryChange('')}
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <FilterPopover
          open={openId === 'period'}
          onClose={close}
          title="תקופה"
          wide
          trigger={
            <Pill
              icon={FIELD_ICONS.event_date}
              label="תקופה"
              value={period.summary}
              active={period.changed}
              open={openId === 'period'}
              onOpen={() => toggle('period')}
              onRemove={
                period.changed
                  ? () => {
                      setDrafts((rows) => rows.filter((row) => row.field !== 'event_date'))
                      onViewChange(withPeriodWindow(view, 'recent', shiftLeadList))
                    }
                  : undefined
              }
              removeLabel="איפוס התקופה"
            />
          }
        >
          <PeriodPanel
            shiftLeadList={shiftLeadList}
            choice={dateDraft ? dateDraft.op : period.choice}
            otherRules={otherRules}
            draft={dateDraft ?? null}
            onWindow={(choice) => {
              setDrafts((rows) => rows.filter((row) => row.field !== 'event_date'))
              onViewChange(withPeriodWindow(view, choice, shiftLeadList))
            }}
            onDate={(rule, hold) => editDraft(rule, false, hold)}
            onDateValidity={(invalid) => {
              if (invalid) pushRule('event_date', null)
              else if (dateDraft) pushRule('event_date', dateDraft)
            }}
          />
        </FilterPopover>

        <FilterPopover
          open={openId === 'status'}
          onClose={close}
          title="סטטוס תיעוד"
          kind="menu"
          trigger={
            <button
              type="button"
              className={['fpill', 'fpill--single', view.status !== 'all' ? 'is-active' : '', openId === 'status' ? 'is-open' : '']
                .filter(Boolean)
                .join(' ')}
              aria-haspopup="menu"
              aria-expanded={openId === 'status'}
              onClick={() => toggle('status')}
            >
              <span className="fdot" style={{ background: STATUS_DOT[view.status] }} aria-hidden="true" />
              <span className="fpill__value">{statusRow && view.status !== 'all' ? statusRow.label : STATUS_ALL_LABEL}</span>
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          }
        >
          {EVENT_FILTERS.map((row) => (
            <MenuItem
              key={row.value}
              role="menuitemradio"
              checked={view.status === row.value}
              icon={<span className="fdot" style={{ background: STATUS_DOT[row.value] }} aria-hidden="true" />}
              label={row.value === 'all' ? STATUS_ALL_LABEL : row.label}
              description={row.tip}
              onSelect={() => {
                setOpenId(null)
                onViewChange({ ...view, status: row.value })
              }}
            />
          ))}
        </FilterPopover>

        <button
          type="button"
          className="fpill fpill--single fpill--toggle"
          aria-pressed={view.showShiftEvents}
          aria-label="הצג אירועים ממשמרות"
          onClick={() => onViewChange({ ...view, showShiftEvents: !view.showShiftEvents })}
        >
          {view.showShiftEvents ? (
            <Check size={16} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Truck size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className="fpill__value" aria-hidden="true">
            משמרות
          </span>
        </button>

        {showOthersControl ? (
          <button
            type="button"
            className="fpill fpill--single fpill--toggle"
            aria-pressed={view.showOthers || hasLeadRule}
            aria-label="הצג אירועים שנוצרו על ידי אחרים"
            disabled={hasLeadRule}
            aria-describedby={hasLeadRule ? 'efilters-others-note' : undefined}
            title={hasLeadRule ? 'סינון לפי אחמ״ש קובע של מי האירועים' : undefined}
            onClick={() => onViewChange({ ...view, showOthers: !view.showOthers })}
          >
            {view.showOthers || hasLeadRule ? (
              <Check size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Users size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className="fpill__value" aria-hidden="true">
              אחרים
            </span>
            {hasLeadRule ? (
              <span id="efilters-others-note" className="visually-hidden">
                סינון לפי אחמ״ש קובע של מי האירועים
              </span>
            ) : null}
          </button>
        ) : null}

        {pills.map((rule) => {
          const def = fieldDef(rule.field)
          const applied = view.rules.find((row) => row.field === rule.field)
          const needsNames = (rule.field === 'shift_lead' || rule.field === 'vehicle_kind') && !lookups
          const value = applied
            ? needsNames
              ? `${(applied as { value: string[] }).value.length} נבחרו`
              : ruleValueLabel(applied, labels)
            : undefined
          return (
            <FilterPopover
              key={rule.field}
              open={openId === `rule:${rule.field}`}
              onClose={close}
              title={def.label}
              trigger={
                <Pill
                  pillRef={(node) => pillRefs.current.set(rule.field, node)}
                  icon={FIELD_ICONS[rule.field]}
                  label={def.label}
                  value={value}
                  active={Boolean(applied)}
                  open={openId === `rule:${rule.field}`}
                  onOpen={() => toggle(`rule:${rule.field}`)}
                  onRemove={() => removeField(rule.field)}
                  removeLabel={`הסרת הסינון ${applied && !needsNames ? ruleSummary(applied, labels) : def.label}`}
                />
              }
            >
              <RulePanel
                rule={rule}
                lookups={lookups}
                lookupsFailed={lookupsFailed}
                onRetryLookups={loadLookups}
                onChange={(next, debounce) => editDraft(next, debounce)}
                onRemove={() => removeField(rule.field)}
              />
            </FilterPopover>
          )
        })}

        {unused.length > 0 ? (
          <AddFilter
            open={openId === 'add'}
            onToggle={() => toggle('add')}
            onClose={close}
            fields={unused.map((def) => def.field)}
            onPick={addField}
            buttonRef={addRef}
          />
        ) : null}

        {anythingSet ? (
          <button type="button" className="ftext" onClick={clearAll}>
            ניקוי סינון
          </button>
        ) : null}

        {userId && currentId === UNSAVED_ID ? (
          <button type="button" className="fpill fpill--single efilters__save" onClick={openSave}>
            <Save size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="fpill__value">שמירת תצוגה</span>
          </button>
        ) : null}
      </div>

      <Dialog
        open={saveOpen}
        title="שמירת תצוגה"
        onClose={() => !saving && setSaveOpen(false)}
        footer={
          <>
            <Button loading={saving} loadingLabel="שומר…" onClick={() => void submitSave()}>
              שמירת תצוגה
            </Button>
            <Button variant="secondary" disabled={saving} onClick={() => setSaveOpen(false)}>
              ביטול
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitSave()
          }}
        >
          <TextField
            label="שם התצוגה"
            required
            inputRef={saveNameRef}
            maxLength={PRESET_NAME_MAX}
            placeholder="למשל: משאיות בכביש 6"
            hint="נשמרים התקופה, הסטטוס, הסינונים והבחירות שבשורה. לא נשמר טקסט החיפוש."
            value={saveName}
            error={saveError ?? undefined}
            onChange={(event) => {
              setSaveName(event.target.value)
              setSaveError(null)
            }}
          />
        </form>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        status="danger"
        title={`למחוק את התצוגה ״${confirmDelete?.name ?? ''}״?`}
        busy={deleting}
        onClose={() => !deleting && setConfirmDelete(null)}
        footer={
          <>
            <Button variant="destructive" loading={deleting} loadingLabel="מוחק…" onClick={() => void submitDelete()}>
              מחיקה
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(null)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">הסינון שעל המסך יישאר כפי שהוא.</p>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmSwitch)}
        status="warning"
        title="להחליף תצוגה?"
        onClose={() => setConfirmSwitch(null)}
        footer={
          <>
            <Button
              onClick={() => {
                if (confirmSwitch) switchTo(confirmSwitch)
                setConfirmSwitch(null)
              }}
            >
              החלפת תצוגה
            </Button>
            <Button variant="secondary" onClick={() => setConfirmSwitch(null)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">הסינון הנוכחי לא נשמר, והוא יוחלף. כדי לשמור אותו, בחרו ״שמירה כתצוגה חדשה״.</p>
      </AlertDialog>
    </div>
  )
}

function Pill({
  icon,
  label,
  value,
  active,
  open,
  onOpen,
  onRemove,
  removeLabel,
  pillRef,
}: {
  icon: ReactNode
  label: string
  value?: string
  active: boolean
  open: boolean
  onOpen: () => void
  onRemove?: () => void
  removeLabel: string
  pillRef?: (node: HTMLButtonElement | null) => void
}) {
  return (
    <span className={['fpill', active ? 'is-active' : '', open ? 'is-open' : ''].filter(Boolean).join(' ')}>
      <button
        ref={pillRef}
        type="button"
        className="fpill__main"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
      >
        {icon}
        <span className="fpill__label">{label}</span>
        {value ? (
          <>
            <span className="fpill__sep" aria-hidden="true" />
            <span className="fpill__value">{value}</span>
          </>
        ) : null}
        {!onRemove ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
      </button>
      {onRemove ? (
        <button type="button" className="fpill__x" aria-label={removeLabel} onClick={onRemove}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

function MenuItem({
  role = 'menuitem',
  checked,
  icon,
  label,
  description,
  danger = false,
  onSelect,
}: {
  role?: 'menuitem' | 'menuitemradio'
  checked?: boolean
  icon?: ReactNode
  label: string
  description?: string
  danger?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'menuitemradio' ? Boolean(checked) : undefined}
      className={['fmi', checked ? 'is-on' : '', danger ? 'is-danger' : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      {icon ? <span className="fmi__icon">{icon}</span> : null}
      <span className="fmi__text">
        <span className="fmi__label">{label}</span>
        {description ? <span className="fmi__desc">{description}</span> : null}
      </span>
      {checked ? <Check size={16} strokeWidth={1.75} aria-hidden="true" className="fmi__check" /> : null}
    </button>
  )
}

function AddFilter({
  open,
  onToggle,
  onClose,
  fields,
  onPick,
  buttonRef,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  fields: FilterField[]
  onPick: (field: FilterField) => void
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  const [find, setFind] = useState('')
  useEffect(() => {
    if (!open) setFind('')
  }, [open])
  const shown = fields.filter((field) => fieldDef(field).label.includes(find.trim()))
  return (
    <FilterPopover
      open={open}
      onClose={onClose}
      title="הוספת סינון"
      kind="menu"
      trigger={
        <button
          ref={buttonRef}
          type="button"
          className="ftext ftext--add"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          הוספת סינון
        </button>
      }
    >
      <label className="ffind">
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="visually-hidden">סינון לפי שדה</span>
        <input
          data-menu-filter
          data-autofocus
          value={find}
          onChange={(event) => setFind(event.target.value)}
          placeholder="סינון לפי…"
        />
      </label>
      {shown.map((field) => (
        <MenuItem key={field} icon={FIELD_ICONS[field]} label={fieldDef(field).label} onSelect={() => onPick(field)} />
      ))}
      {shown.length === 0 ? <p className="fpop__note">אין שדה בשם הזה.</p> : null}
    </FilterPopover>
  )
}

function PeriodPanel({
  shiftLeadList,
  choice,
  otherRules,
  draft,
  onWindow,
  onDate,
  onDateValidity,
}: {
  shiftLeadList: boolean
  choice: string
  otherRules: boolean
  draft: DateRule | null
  onWindow: (choice: 'recent' | 'window') => void
  onDate: (rule: DateRule, hold: boolean) => void
  /** While a typed date is invalid the date rule is withheld, not half applied. */
  onDateValidity: (invalid: boolean) => void
}) {
  const [invalid, setInvalid] = useState({ from: false, to: false })
  const anyInvalid = invalid.from || invalid.to
  const validityRef = useRef(onDateValidity)
  validityRef.current = onDateValidity
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    validityRef.current(anyInvalid)
  }, [anyInvalid])
  const windowsOff = otherRules && !draft
  const date = draft ?? { field: 'event_date' as const, op: 'on' as const, value: { from: '', to: '' } }
  return (
    <div className="fpanel">
      <p className="fpanel__head">תקופה · לפי תאריך האירוע</p>
      {windowsOff ? (
        <p className="fpanel__note">סינונים פעילים מחפשים בכל התאריכים. בחרו יום או טווח כדי לצמצם.</p>
      ) : null}
      <div className="fpanel__options" role="radiogroup" aria-label="תקופה">
        {shiftLeadList ? (
          <PeriodOption
            checked={choice === 'recent'}
            disabled={windowsOff}
            label={PERIOD_LABELS.recent}
            description="ואירועים ישנים שחסרים בהם פרטים שלך"
            onSelect={() => onWindow('recent')}
          />
        ) : null}
        <PeriodOption
          checked={choice === 'window'}
          disabled={windowsOff}
          label={PERIOD_LABELS.window}
          description="טען עוד מוסיף 30 ימים"
          onSelect={() => onWindow('window')}
        />
        <PeriodOption
          checked={choice === 'on'}
          label="יום מסוים"
          onSelect={() => onDate({ field: 'event_date', op: 'on', value: { from: date.value.from, to: '' } }, anyInvalid)}
        />
        <PeriodOption
          checked={choice === 'between'}
          label="טווח תאריכים"
          onSelect={() => onDate({ field: 'event_date', op: 'between', value: date.value }, anyInvalid)}
        />
      </div>
      {draft?.op === 'on' ? (
        <DateField
          label="תאריך"
          value={draft.value.from}
          invalidMessage="תאריך לא תקין"
          onValidityChange={(bad) => setInvalid({ from: bad, to: false })}
          onChange={(from) => onDate({ ...draft, value: { from, to: '' } }, anyInvalid)}
        />
      ) : null}
      {draft?.op === 'between' ? (
        <div className="fpanel__pair">
          <DateField
            label="מתאריך"
            value={draft.value.from}
            max={draft.value.to || undefined}
            invalidMessage="תאריך לא תקין"
            onValidityChange={(bad) => setInvalid((row) => ({ ...row, from: bad }))}
            onChange={(from) => onDate({ ...draft, value: { ...draft.value, from } }, anyInvalid)}
          />
          <DateField
            label="עד תאריך"
            value={draft.value.to}
            min={draft.value.from || undefined}
            invalidMessage="תאריך לא תקין"
            onValidityChange={(bad) => setInvalid((row) => ({ ...row, to: bad }))}
            onChange={(to) => onDate({ ...draft, value: { ...draft.value, to } }, anyInvalid)}
          />
          {draft.value.from && draft.value.to && draft.value.from > draft.value.to ? (
            <p className="field__hint field__hint--error fpanel__pair-error" role="alert">
              {ruleError(draft)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function PeriodOption({
  checked,
  disabled = false,
  label,
  description,
  onSelect,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  description?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      className={['fmi', checked ? 'is-on' : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <span className="fmi__text">
        <span className="fmi__label">{label}</span>
        {description ? <span className="fmi__desc">{description}</span> : null}
      </span>
      {checked ? <Check size={16} strokeWidth={1.75} aria-hidden="true" className="fmi__check" /> : null}
    </button>
  )
}

function RulePanel({
  rule,
  lookups,
  lookupsFailed,
  onRetryLookups,
  onChange,
  onRemove,
}: {
  rule: FilterRule
  lookups: FilterLookups | null
  lookupsFailed: boolean
  onRetryLookups: () => void
  onChange: (rule: FilterRule, debounce?: boolean) => void
  onRemove: () => void
}) {
  const def = fieldDef(rule.field)
  const [find, setFind] = useState('')
  const [touched, setTouched] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const optionsReady = lookups !== null

  // Options arrive after the panel opens: move focus from its header to the first field.
  useEffect(() => {
    const root = rootRef.current
    const active = document.activeElement
    if (!optionsReady || !root || (active instanceof HTMLInputElement && root.contains(active))) return
    if (active && root.contains(active)) root.querySelector<HTMLElement>('input')?.focus()
  }, [optionsReady])
  const error = touched && !isEmptyRule(rule) ? (ruleError(rule) ?? undefined) : undefined

  let body: ReactNode
  switch (rule.field) {
    case 'shift_lead':
    case 'vehicle_kind': {
      const all = (rule.field === 'shift_lead' ? lookups?.shiftLeads : lookups?.vehicleKinds) ?? []
      const shown = all.filter((row) => row.label.includes(find.trim()))
      body = !lookups ? (
        lookupsFailed ? (
          <div className="fpanel__fields">
            <p className="field__hint field__hint--error" role="alert">
              טעינת האפשרויות נכשלה. בדקו את החיבור ונסו שוב.
            </p>
            <Button variant="secondary" onClick={onRetryLookups}>
              טעינה מחדש
            </Button>
          </div>
        ) : (
          <p className="fpop__note" aria-live="polite">
            טוען אפשרויות…
          </p>
        )
      ) : (
        <>
          {all.length > 6 ? (
            <label className="ffind">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="visually-hidden">{`חיפוש ${def.label}`}</span>
              <input
                data-autofocus
                value={find}
                onChange={(event) => setFind(event.target.value)}
                placeholder={`חיפוש ${def.label}`}
              />
            </label>
          ) : null}
          <div className="fpanel__list" role="group" aria-label={def.label}>
            {shown.map((row) => (
              <Checkbox
                key={row.id}
                id={`efilter-${rule.field}-${row.id}`}
                label={row.label}
                checked={rule.value.includes(row.id)}
                onChange={(on) =>
                  onChange({
                    ...rule,
                    value: on ? [...rule.value, row.id] : rule.value.filter((id) => id !== row.id),
                  })
                }
              />
            ))}
            {shown.length === 0 ? <p className="fpop__note">אין תוצאות.</p> : null}
          </div>
        </>
      )
      break
    }
    case 'responder':
      body = (
        <div className="fpanel__fields">
          <TextField
            label="שם או או״ק מכיל"
            placeholder="למשל: רונית או 318"
            value={rule.value}
            error={error}
            onBlur={() => setTouched(true)}
            onChange={(event) => onChange({ ...rule, value: event.target.value }, true)}
          />
        </div>
      )
      break
    case 'treated_plate':
      body = (
        <div className="fpanel__fields">
          <TextField
            label="ספרות מספר הרכב מכילות"
            numeric
            isolate
            inputMode="numeric"
            placeholder="12-345-67"
            maxLength={10}
            value={rule.value}
            error={error}
            onBlur={() => setTouched(true)}
            onChange={(event) => onChange({ ...rule, value: digitsOnly(event.target.value) }, true)}
          />
        </div>
      )
      break
    case 'event_id':
      body = (
        <div className="fpanel__fields">
          <div className="fseg" role="radiogroup" aria-label="תנאי">
            {def.ops.map((row) => (
              <button
                key={row.op}
                type="button"
                role="radio"
                aria-checked={rule.op === row.op}
                onClick={() => onChange({ ...rule, op: row.op as 'is' | 'contains' })}
              >
                {row.label}
              </button>
            ))}
          </div>
          <TextField
            label="מספר אירוע"
            numeric
            isolate
            inputMode="numeric"
            placeholder="48210"
            value={rule.value}
            error={error}
            onBlur={() => setTouched(true)}
            onChange={(event) => onChange({ ...rule, value: policeEventIdForInput(event.target.value) }, true)}
          />
        </div>
      )
      break
    case 'event_date':
      body = null
      break
  }

  return (
    <div ref={rootRef} className="fpanel">
      <div className="fpanel__top">
        <p className="fpanel__head">{def.label}</p>
        <button type="button" className="fpanel__remove" onClick={onRemove}>
          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          הסרת הסינון
        </button>
      </div>
      {body}
      {!isEmptyRule(rule) && (rule.field === 'shift_lead' || rule.field === 'vehicle_kind') ? (
        <button type="button" className="fpanel__foot" onClick={() => onChange({ ...rule, value: [] })}>
          ניקוי הבחירה
        </button>
      ) : null}
    </div>
  )
}
