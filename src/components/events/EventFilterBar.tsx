import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListFilter, X } from 'lucide-react'
import {
  DEFAULT_EVENT_LIST_VIEW,
  fieldDef,
  ruleSummary,
  sameView,
  type EventListView,
  type FilterRule,
} from '../../lib/eventFilters'
import type { FilterLookups } from '../../lib/eventFiltersApi'
import {
  DEFAULT_PRESET_ID,
  DEFAULT_PRESET_NAME,
  PRESET_NAME_MAX,
  presetNameError,
  type EventFilterPreset,
} from '../../lib/eventFilterPresets'
import { AlertDialog } from '../ui/AlertDialog'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { EventFiltersDialog } from './EventFiltersDialog'

export type EventFilterBarApi = {
  fetchFilterLookups: () => Promise<FilterLookups>
  listPresets: (userId: string) => Promise<EventFilterPreset[]>
  savePreset: (userId: string, name: string, view: EventListView) => Promise<EventFilterPreset>
  deletePreset: (userId: string, id: string) => Promise<void>
}

const UNSAVED_ID = 'unsaved'

type EventFilterBarProps = {
  view: EventListView
  onViewChange: (view: EventListView) => void
  userId: string | undefined
  /** What ברירת מחדל shows this viewer (12 hours or 30 days). */
  defaultCaption: string
  api: EventFilterBarApi
}

export function EventFilterBar({ view, onViewChange, userId, defaultCaption, api }: EventFilterBarProps) {
  const { show } = useToast()
  const [presets, setPresets] = useState<EventFilterPreset[]>([])
  const [lookups, setLookups] = useState<FilterLookups | null>(null)
  const [lookupsFailed, setLookupsFailed] = useState(false)
  const [lookupsRequested, setLookupsRequested] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EventFilterPreset | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!userId) return
    let active = true
    api
      .listPresets(userId)
      .then((rows) => {
        if (active) setPresets(rows)
      })
      .catch(() => {
        if (active) show('טעינת התצוגות השמורות נכשלה. ניתן להמשיך לסנן.', 'alert')
      })
    return () => {
      active = false
    }
  }, [api, show, userId])

  // Two small lookups, fetched only once a rule or the dialog needs them.
  const needsLookups =
    filtersOpen || view.rules.some((rule) => rule.field === 'shift_lead' || rule.field === 'vehicle_kind')
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

  const options = [
    { value: DEFAULT_PRESET_ID, label: DEFAULT_PRESET_NAME, description: defaultCaption },
    ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
    ...(currentId === UNSAVED_ID ? [{ value: UNSAVED_ID, label: 'סינון שלא נשמר' }] : []),
  ]

  function chipText(rule: FilterRule): string {
    if ((rule.field === 'shift_lead' || rule.field === 'vehicle_kind') && !lookups) {
      return `${fieldDef(rule.field).label}: ${rule.value.length} נבחרו`
    }
    return ruleSummary(rule, labels)
  }

  async function submitSave() {
    if (!userId) return
    const error = presetNameError(saveName, presets)
    if (error) {
      setSaveError(error)
      return
    }
    setSaving(true)
    try {
      const saved = await api.savePreset(userId, saveName, view)
      setPresets((rows) => [...rows, saved])
      setSaveOpen(false)
      show('התצוגה נשמרה', 'done')
    } catch {
      setSaveError('שמירת התצוגה נכשלה. בדקו את החיבור ונסו שוב.')
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

  return (
    <div className="events-filterbar">
      <div className="events-filterbar__controls">
        <div className="events-filterbar__view">
          <span className="t-label text-secondary" aria-hidden="true">
            תצוגה
          </span>
          <SelectField
            label="תצוגה"
            hideLabel
            options={options}
            value={currentId}
            onChange={(event) => {
              const id = event.target.value
              if (id === DEFAULT_PRESET_ID) onViewChange(DEFAULT_EVENT_LIST_VIEW)
              const preset = presets.find((row) => row.id === id)
              if (preset) onViewChange(preset.view)
            }}
          />
        </div>
        <button
          type="button"
          className="chip events-filterbar__open"
          aria-haspopup="dialog"
          onClick={() => setFiltersOpen(true)}
        >
          <ListFilter size={20} strokeWidth={1.75} aria-hidden="true" />
          {view.rules.length > 0 ? `סינון · ${view.rules.length}` : 'סינון'}
        </button>
        {currentId === UNSAVED_ID && userId ? (
          <Button
            variant="ghost"
            className="events-filterbar__action"
            onClick={() => {
              setSaveName('')
              setSaveError(null)
              setSaveOpen(true)
            }}
          >
            שמירת תצוגה
          </Button>
        ) : null}
        {currentPreset ? (
          <Button
            variant="ghost"
            className="events-filterbar__action"
            onClick={() => setConfirmDelete(currentPreset)}
          >
            מחיקת התצוגה
          </Button>
        ) : null}
      </div>

      {view.rules.length > 0 ? (
        <ul className="events-filterbar__rules" aria-label="תנאי סינון פעילים">
          {view.rules.map((rule) => {
            const text = chipText(rule)
            return (
              <li key={rule.field} className="events-filterbar__rule">
                <button
                  type="button"
                  className="events-filterbar__rule-edit"
                  aria-haspopup="dialog"
                  onClick={() => setFiltersOpen(true)}
                >
                  <span className="events-filterbar__rule-text">{text}</span>
                </button>
                <button
                  type="button"
                  className="events-filterbar__rule-remove"
                  aria-label={`הסרת התנאי ${text}`}
                  onClick={() =>
                    onViewChange({ ...view, rules: view.rules.filter((row) => row.field !== rule.field) })
                  }
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            )
          })}
          <li>
            <Button
              variant="ghost"
              className="events-filterbar__action"
              onClick={() => onViewChange({ ...view, rules: [] })}
            >
              ניקוי התנאים
            </Button>
          </li>
        </ul>
      ) : null}

      <EventFiltersDialog
        open={filtersOpen}
        rules={view.rules}
        lookups={lookups}
        lookupsFailed={lookupsFailed}
        onRetryLookups={loadLookups}
        onApply={(rules) => {
          setFiltersOpen(false)
          onViewChange({ ...view, rules })
        }}
        onClose={() => setFiltersOpen(false)}
      />

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
            maxLength={PRESET_NAME_MAX}
            placeholder="למשל: משאיות בכביש 6"
            hint="נשמרים התנאים, סטטוס התיעוד והבחירות שבסרגל. לא נשמר טקסט החיפוש."
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
            <Button
              variant="destructive"
              loading={deleting}
              loadingLabel="מוחק…"
              onClick={() => void submitDelete()}
            >
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
    </div>
  )
}
