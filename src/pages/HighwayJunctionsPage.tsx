import { useEffect, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../lib/auth'
import { LocationPlacesField } from '../components/events/LocationPlacesField'
import { emptyLocationPlaceFields, type LocationPlaceFields } from '../lib/systemDistricts'
import {
  addAliasToList,
  createHighwayJunction,
  fetchHighwayJunctionsForAdmin,
  removeAliasFromList,
  updateHighwayJunctionAliases,
  type HighwayJunctionAdminRow,
} from '../lib/highwayJunctionsAdmin'

/** Super-admin management of public.highway_junctions: aliases on existing rows,
 *  and (rarely) a junction missing from the original seed. */
export function HighwayJunctionsPage() {
  const { user } = useAuth()
  const { show } = useToast()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<HighwayJunctionAdminRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setFailed(false)
    const handle = window.setTimeout(() => {
      void fetchHighwayJunctionsForAdmin(query).then((result) => {
        if (!active) return
        if (!result.ok) {
          setFailed(true)
          setRows([])
          return
        }
        setRows(result.rows)
      })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [query, reloadKey])

  function patchRow(id: string, patch: Partial<HighwayJunctionAdminRow>) {
    setRows((current) => (current ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  return (
    <div className="page--wide stack-6">
      <div className="page-head">
        <div>
          <h1 className="t-title">צמתים בין-עירוניים</h1>
          <p className="t-caption text-muted">
            הוספת כינויים לצמתים קיימים, ולעיתים נדירות — הוספת צומת שחסר ברשימה המקורית.
          </p>
        </div>
      </div>

      <section className="stack-4">
        <div className="form-section">
          <h2 className="form-section__heading">חיפוש ועריכת כינויים</h2>
        </div>
        <TextField
          label="חיפוש צומת"
          placeholder="חיפוש לפי שם בעברית או באנגלית"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {rows === null && !failed ? <EventListSkeleton /> : null}

        {failed ? (
          <EmptyState
            icon={<MapPin size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="טעינת הצמתים נכשלה. בדקו את החיבור ונסו שוב."
            action={
              <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
                רענון
              </Button>
            }
          />
        ) : null}

        {rows && rows.length === 0 && !failed ? (
          <EmptyState
            icon={<MapPin size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="לא נמצאו צמתים."
          />
        ) : null}

        {rows && rows.length > 0 ? (
          <ul className="stack-3">
            {rows.map((row) => (
              <JunctionRow
                key={row.id}
                row={row}
                onSaved={(patch) => patchRow(row.id, patch)}
                showError={(message) => show(message, 'alert')}
              />
            ))}
          </ul>
        ) : null}
      </section>

      <section className="stack-4">
        <div className="form-section">
          <h2 className="form-section__heading">הוספת צומת חסר</h2>
        </div>
        <AddJunctionForm
          createdBy={user?.id ?? null}
          onCreated={() => setReloadKey((key) => key + 1)}
          showError={(message) => show(message, 'alert')}
          showDone={(message) => show(message, 'done')}
        />
      </section>
    </div>
  )
}

function JunctionRow({
  row,
  onSaved,
  showError,
}: {
  row: HighwayJunctionAdminRow
  onSaved: (patch: Partial<HighwayJunctionAdminRow>) => void
  showError: (message: string) => void
}) {
  const [draftHe, setDraftHe] = useState('')
  const [draftEn, setDraftEn] = useState('')
  const [saving, setSaving] = useState(false)

  async function persist(aliasesHe: string[], aliasesEn: string[]) {
    setSaving(true)
    const result = await updateHighwayJunctionAliases(row.id, aliasesHe, aliasesEn)
    setSaving(false)
    if (!result.ok) {
      showError(result.error)
      return
    }
    onSaved({ aliases_he: aliasesHe, aliases_en: aliasesEn })
  }

  function addHe() {
    const next = addAliasToList(row.aliases_he, draftHe)
    if (next === row.aliases_he) return
    setDraftHe('')
    void persist(next, row.aliases_en)
  }

  function addEn() {
    const next = addAliasToList(row.aliases_en, draftEn)
    if (next === row.aliases_en) return
    setDraftEn('')
    void persist(row.aliases_he, next)
  }

  function removeHe(alias: string) {
    void persist(removeAliasFromList(row.aliases_he, alias), row.aliases_en)
  }

  function removeEn(alias: string) {
    void persist(row.aliases_he, removeAliasFromList(row.aliases_en, alias))
  }

  return (
    <li className="card stack-3">
      <div>
        <p className="t-section">{row.name_he}</p>
        <p className="t-caption text-muted">
          {[row.name_en, row.roads ? `כביש ${row.roads}` : null].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <AliasEditor
        label="כינויים בעברית"
        aliases={row.aliases_he}
        draft={draftHe}
        disabled={saving}
        onDraftChange={setDraftHe}
        onAdd={addHe}
        onRemove={removeHe}
      />
      <AliasEditor
        label="כינויים באנגלית"
        aliases={row.aliases_en}
        draft={draftEn}
        disabled={saving}
        onDraftChange={setDraftEn}
        onAdd={addEn}
        onRemove={removeEn}
      />
    </li>
  )
}

function AliasEditor({
  label,
  aliases,
  draft,
  disabled,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  label: string
  aliases: string[]
  draft: string
  disabled: boolean
  onDraftChange: (value: string) => void
  onAdd: () => void
  onRemove: (alias: string) => void
}) {
  return (
    <div className="stack-2">
      <span className="t-caption text-muted">{label}</span>
      {aliases.length > 0 ? (
        <div className="tags">
          {aliases.map((alias) => (
            <span key={alias} className="tag">
              <span>{alias}</span>
              <button
                type="button"
                className="table-edit__remove"
                aria-label={`הסרת הכינוי ${alias}`}
                disabled={disabled}
                onClick={() => onRemove(alias)}
              >
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="row-between" style={{ gap: 'var(--space-2)' }}>
        <input
          className="field__input"
          type="text"
          value={draft}
          placeholder="כינוי חדש"
          aria-label={label}
          disabled={disabled}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
        />
        <Button variant="secondary" disabled={disabled || !draft.trim()} onClick={onAdd}>
          הוספה
        </Button>
      </div>
    </div>
  )
}

function AddJunctionForm({
  createdBy,
  onCreated,
  showError,
  showDone,
}: {
  createdBy: string | null
  onCreated: () => void
  showError: (message: string) => void
  showDone: (message: string) => void
}) {
  const [nameHe, setNameHe] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [roads, setRoads] = useState('')
  const [place, setPlace] = useState<LocationPlaceFields>(emptyLocationPlaceFields())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (saving) return
    if (!createdBy) {
      showError('יש להתחבר מחדש כדי להוסיף צומת.')
      return
    }
    if (!nameHe.trim()) {
      setError('יש להזין שם צומת.')
      return
    }
    if (place.location_lat == null || place.location_lng == null) {
      setError('יש לבחור מיקום במפה.')
      return
    }
    setError(null)
    setSaving(true)
    const result = await createHighwayJunction({
      name_he: nameHe,
      name_en: nameEn || null,
      roads: roads || null,
      lat: place.location_lat,
      lng: place.location_lng,
      createdBy,
    })
    setSaving(false)
    if (!result.ok) {
      showError(result.error)
      return
    }
    setNameHe('')
    setNameEn('')
    setRoads('')
    setPlace(emptyLocationPlaceFields())
    showDone('הצומת נוסף בהצלחה.')
    onCreated()
  }

  return (
    <div className="card stack-3">
      <TextField
        label="שם הצומת (עברית)"
        required
        value={nameHe}
        onChange={(event) => setNameHe(event.target.value)}
      />
      <TextField
        label="שם הצומת (אנגלית)"
        value={nameEn}
        onChange={(event) => setNameEn(event.target.value)}
      />
      <TextField
        label="כבישים (חופשי)"
        placeholder="למשל: 4/44"
        value={roads}
        onChange={(event) => setRoads(event.target.value)}
      />
      <LocationPlacesField
        value={place}
        label="מיקום במפה"
        placeholder="חיפוש ב-Google Maps"
        allowFreeText={false}
        onChange={setPlace}
        onPlaceCommit={setPlace}
      />
      {error ? (
        <p className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button loading={saving} loadingLabel="מוסיף…" onClick={() => void submit()}>
        הוספת צומת
      </Button>
    </div>
  )
}
