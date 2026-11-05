import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  FILTER_FIELDS,
  activeRules,
  emptyRule,
  fieldDef,
  ruleError,
  type FilterField,
  type FilterRule,
} from '../../lib/eventFilters'
import type { FilterLookups } from '../../lib/eventFiltersApi'
import { digitsOnly, policeEventIdForInput } from '../../lib/format'
import { Button, IconButton } from '../ui/Button'
import { DateField } from '../ui/DateField'
import { Dialog } from '../ui/Dialog'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

type EventFiltersDialogProps = {
  open: boolean
  rules: readonly FilterRule[]
  lookups: FilterLookups | null
  lookupsFailed: boolean
  onRetryLookups: () => void
  onApply: (rules: FilterRule[]) => void
  onClose: () => void
}

export function EventFiltersDialog({
  open,
  rules,
  lookups,
  lookupsFailed,
  onRetryLookups,
  onApply,
  onClose,
}: EventFiltersDialogProps) {
  const [draft, setDraft] = useState<FilterRule[]>([])
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(rules.map((rule) => ({ ...rule }) as FilterRule))
    setShowErrors(false)
  }, [open, rules])

  const unused = FILTER_FIELDS.filter((def) => !draft.some((rule) => rule.field === def.field))

  function update(index: number, next: FilterRule) {
    setDraft((rows) => rows.map((row, i) => (i === index ? next : row)))
  }

  function apply() {
    if (draft.some((rule) => ruleError(rule))) {
      setShowErrors(true)
      return
    }
    onApply(activeRules(draft))
  }

  return (
    <Dialog
      open={open}
      title="סינון אירועים"
      onClose={onClose}
      form
      footer={
        <>
          <Button onClick={apply}>הצגת אירועים</Button>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <div className="event-filters">
        <p className="t-caption text-secondary">
          אירוע מוצג רק אם הוא עומד בכל התנאים. הסינון מחפש בכל התאריכים, לא רק ברשימה הנוכחית.
        </p>
        {draft.length === 0 ? (
          <p className="t-body text-muted event-filters__empty">עדיין לא נוספו תנאים.</p>
        ) : (
          <ul className="event-filters__rules">
            {draft.map((rule, index) => (
              <li key={rule.field} className="event-filters__rule">
                <div className="event-filters__rule-head">
                  <h3 className="t-label">{fieldDef(rule.field).label}</h3>
                  <IconButton
                    label={`הסרת התנאי ${fieldDef(rule.field).label}`}
                    onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <X size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                </div>
                <RuleEditor
                  rule={rule}
                  lookups={lookups}
                  lookupsFailed={lookupsFailed}
                  onRetryLookups={onRetryLookups}
                  error={showErrors ? ruleError(rule) : null}
                  onChange={(next) => update(index, next)}
                />
              </li>
            ))}
          </ul>
        )}
        {unused.length > 0 ? (
          <SelectField
            label="הוספת תנאי"
            placeholder="בחירת שדה"
            options={unused.map((def) => ({ value: def.field, label: def.label }))}
            value=""
            onChange={(event) => {
              const field = event.target.value as FilterField
              if (FILTER_FIELDS.some((def) => def.field === field)) {
                setDraft((rows) => [...rows, emptyRule(field)])
              }
            }}
          />
        ) : null}
      </div>
    </Dialog>
  )
}

function RuleEditor({
  rule,
  lookups,
  lookupsFailed,
  onRetryLookups,
  error,
  onChange,
}: {
  rule: FilterRule
  lookups: FilterLookups | null
  lookupsFailed: boolean
  onRetryLookups: () => void
  error: string | null
  onChange: (rule: FilterRule) => void
}) {
  const def = fieldDef(rule.field)
  const opSelect =
    def.ops.length > 1 ? (
      <SelectField
        label="תנאי"
        options={def.ops.map((row) => ({ value: row.op, label: row.label }))}
        value={rule.op}
        onChange={(event) => {
          if (rule.field === 'event_id' && (event.target.value === 'is' || event.target.value === 'contains')) {
            onChange({ ...rule, op: event.target.value })
          }
          if (rule.field === 'event_date' && (event.target.value === 'on' || event.target.value === 'between')) {
            onChange({ ...rule, op: event.target.value })
          }
        }}
      />
    ) : null

  switch (rule.field) {
    case 'shift_lead':
    case 'vehicle_kind': {
      const options =
        (rule.field === 'shift_lead' ? lookups?.shiftLeads : lookups?.vehicleKinds)?.map((row) => ({
          value: row.id,
          label: row.label,
        })) ?? []
      if (!lookups) {
        return lookupsFailed ? (
          <div className="event-filters__lookup-error">
            <p className="field__hint field__hint--error" role="alert">
              טעינת האפשרויות נכשלה. בדקו את החיבור ונסו שוב.
            </p>
            <Button variant="secondary" onClick={onRetryLookups}>
              טעינה מחדש
            </Button>
          </div>
        ) : (
          <p className="t-caption text-muted" aria-live="polite">
            טוען אפשרויות…
          </p>
        )
      }
      const picked = options.filter((option) => rule.value.includes(option.value))
      return (
        <SelectField
          label={rule.field === 'shift_lead' ? 'בחירת אחמ״ש' : 'בחירת סוג רכב'}
          hideLabel
          multiple
          searchable={options.length > 6}
          searchPlaceholder={rule.field === 'shift_lead' ? 'חיפוש אחמ״ש' : 'חיפוש סוג רכב'}
          placeholder={rule.field === 'shift_lead' ? 'בחירת אחמ״ש' : 'בחירת סוג רכב'}
          options={options}
          values={rule.value}
          summaryLabel={
            picked.length > 1 ? `${picked[0]!.label} +${picked.length - 1}` : picked[0]?.label
          }
          onValuesChange={(values) => onChange({ ...rule, value: values })}
          error={error ?? undefined}
        />
      )
    }
    case 'responder':
      return (
        <TextField
          label="שם או או״ק"
          placeholder="למשל: רונית או 318"
          value={rule.value}
          onChange={(event) => onChange({ ...rule, value: event.target.value })}
          error={error ?? undefined}
        />
      )
    case 'event_id':
      return (
        <div className="event-filters__pair">
          {opSelect}
          <TextField
            label="מספר אירוע"
            numeric
            inputMode="numeric"
            placeholder="למשל: 48210"
            value={rule.value}
            onChange={(event) => onChange({ ...rule, value: policeEventIdForInput(event.target.value) })}
            error={error ?? undefined}
          />
        </div>
      )
    case 'treated_plate':
      return (
        <TextField
          label="ספרות מספר הרכב"
          numeric
          isolate
          inputMode="numeric"
          placeholder="12-345-67"
          maxLength={10}
          value={rule.value}
          onChange={(event) => onChange({ ...rule, value: digitsOnly(event.target.value) })}
          error={error ?? undefined}
        />
      )
    case 'event_date':
      return (
        <div className="stack-3">
          {opSelect}
          {rule.op === 'on' ? (
            <DateField
              label="תאריך"
              value={rule.value.from}
              onChange={(from) => onChange({ ...rule, value: { from, to: '' } })}
              error={error ?? undefined}
            />
          ) : (
            <div className="event-filters__pair">
              <DateField
                label="מתאריך"
                value={rule.value.from}
                max={rule.value.to || undefined}
                onChange={(from) => onChange({ ...rule, value: { ...rule.value, from } })}
              />
              <DateField
                label="עד תאריך"
                value={rule.value.to}
                min={rule.value.from || undefined}
                onChange={(to) => onChange({ ...rule, value: { ...rule.value, to } })}
              />
              {error ? (
                <p className="field__hint field__hint--error event-filters__pair-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )
  }
}
