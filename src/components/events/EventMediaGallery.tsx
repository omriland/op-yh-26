import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { compressEventImage } from '../../lib/compressEventImage'
import {
  EVENT_MEDIA_ADDED,
  EVENT_MEDIA_CAP,
  EVENT_MEDIA_CAP_ERROR,
  EVENT_MEDIA_DELETED,
  EVENT_MEDIA_EMPTY_DETAIL,
  EVENT_MEDIA_NETWORK,
  EVENT_MEDIA_TAKEN_WHEN_LABEL,
  EVENT_MEDIA_UPDATED,
  canAddMoreMedia,
  captionError,
  deleteEventMedia,
  groupMediaByTakenWhen,
  listEventMedia,
  listEventMediaPlates,
  slotsRemaining,
  updateEventMedia,
  uploadEventMedia,
  type EventMedia,
  type EventMediaPlateOption,
  type EventMediaTakenWhen,
} from '../../lib/eventMedia'
import { formatDateTime, formatPlate } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { LicensePlate } from '../ui/LicensePlate'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'

export type EventMediaGalleryProps = {
  eventId: string
  canWrite: boolean
  showEmptyCopy: boolean
  viewerId: string | null
  error?: string
  onUnfinishedChange?: (count: number) => void
}

type MediaDraft = {
  key: string
  file: File
  previewUrl: string
  takenWhen: '' | EventMediaTakenWhen
  treatedPlateId: string
  caption: string
  uploading: boolean
  error?: string
}

const TAKEN_WHEN_OPTIONS = (
  Object.entries(EVENT_MEDIA_TAKEN_WHEN_LABEL) as [EventMediaTakenWhen, string][]
).map(([value, label]) => ({ value, label }))

function plateOptions(plates: readonly EventMediaPlateOption[]) {
  return [
    { value: '', label: 'ללא שיוך לרכב' },
    ...plates.map((plate) => ({
      value: plate.id,
      label: formatPlate(plate.plate_number),
    })),
  ]
}

export function EventMediaGallery({
  eventId,
  canWrite,
  showEmptyCopy,
  viewerId,
  error,
  onUnfinishedChange,
}: EventMediaGalleryProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { show } = useToast()
  const [items, setItems] = useState<EventMedia[]>([])
  const [plates, setPlates] = useState<EventMediaPlateOption[]>([])
  const [drafts, setDrafts] = useState<MediaDraft[]>([])
  const [viewer, setViewer] = useState<EventMedia | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTakenWhen, setEditTakenWhen] = useState<EventMediaTakenWhen>('before_treatment')
  const [editPlateId, setEditPlateId] = useState('')
  const [editCaption, setEditCaption] = useState('')
  const [editError, setEditError] = useState<string | undefined>()
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const inFlight = drafts.filter((draft) => draft.uploading).length
  const addEnabled = canWrite && canAddMoreMedia(items.length, inFlight)

  useEffect(() => {
    let active = true
    void listEventMedia(eventId).then((rows) => {
      if (active) setItems(rows)
    })
    void listEventMediaPlates(eventId).then((rows) => {
      if (active) setPlates(rows)
    })
    return () => {
      active = false
    }
  }, [eventId])

  useEffect(() => {
    onUnfinishedChange?.(drafts.filter((draft) => !draft.takenWhen).length)
  }, [drafts, onUnfinishedChange])

  useEffect(() => {
    return () => {
      drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl))
    }
    // Only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = groupMediaByTakenWhen(items)

  function patchDraft(key: string, patch: Partial<MediaDraft>) {
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  async function startUpload(key: string, takenWhen: EventMediaTakenWhen) {
    const draft = draftsRef.current.find((row) => row.key === key)
    if (!draft) return
    patchDraft(key, { uploading: true, error: undefined, takenWhen })
    const compressed = await compressEventImage(draft.file)
    if (!compressed.ok) {
      patchDraft(key, { uploading: false, error: compressed.error })
      return
    }
    const latest = draftsRef.current.find((row) => row.key === key) ?? draft
    const result = await uploadEventMedia({
      eventId,
      blob: compressed.blob,
      width: compressed.width,
      height: compressed.height,
      takenWhen,
      treatedPlateId: latest.treatedPlateId || null,
      caption: latest.caption.trim() || null,
    })
    if (!result.ok) {
      patchDraft(key, { uploading: false, error: result.error })
      return
    }
    URL.revokeObjectURL(draft.previewUrl)
    setDrafts((current) => current.filter((row) => row.key !== key))
    setItems((current) => [...current, result.media])
    show(EVENT_MEDIA_ADDED, 'done')
  }

  function onPick(fileList: FileList | null) {
    if (!fileList || !addEnabled) return
    const remaining = slotsRemaining(items.length, inFlight)
    const picked = Array.from(fileList).slice(0, Math.max(0, remaining))
    const next: MediaDraft[] = picked.map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      takenWhen: '',
      treatedPlateId: '',
      caption: '',
      uploading: false,
    }))
    setDrafts((current) => [...current, ...next])
    if (inputRef.current) inputRef.current.value = ''
    void listEventMediaPlates(eventId).then(setPlates)
  }

  function removeDraft(key: string) {
    setDrafts((current) => {
      const row = current.find((draft) => draft.key === key)
      if (row) URL.revokeObjectURL(row.previewUrl)
      return current.filter((draft) => draft.key !== key)
    })
  }

  function openViewer(item: EventMedia) {
    setViewer(item)
    setEditing(false)
    setConfirmDelete(false)
    setEditTakenWhen(item.taken_when)
    setEditPlateId(item.treated_plate_id ?? '')
    setEditCaption(item.caption ?? '')
    setEditError(undefined)
  }

  async function onSaveEdit() {
    if (!viewer) return
    const captionIssue = captionError(editCaption)
    if (captionIssue) {
      setEditError(captionIssue)
      return
    }
    setSavingEdit(true)
    const result = await updateEventMedia({
      id: viewer.id,
      takenWhen: editTakenWhen,
      treatedPlateId: editPlateId || null,
      caption: editCaption.trim() || null,
    })
    setSavingEdit(false)
    if (!result.ok) {
      setEditError(result.error)
      show(result.error, 'alert')
      return
    }
    const next: EventMedia = {
      ...viewer,
      taken_when: editTakenWhen,
      treated_plate_id: editPlateId || null,
      caption: editCaption.trim() || null,
    }
    setItems((current) => current.map((row) => (row.id === next.id ? next : row)))
    setViewer(next)
    setEditing(false)
    show(EVENT_MEDIA_UPDATED, 'done')
  }

  async function onDelete() {
    if (!viewer) return
    setDeleting(true)
    const result = await deleteEventMedia({ id: viewer.id, storagePath: viewer.storage_path })
    setDeleting(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    setItems((current) => current.filter((row) => row.id !== viewer.id))
    setViewer(null)
    setConfirmDelete(false)
    show(EVENT_MEDIA_DELETED, 'done')
  }

  const ownViewer = Boolean(viewer && viewerId && viewer.uploaded_by === viewerId && canWrite)
  const linkedPlate = viewer
    ? plates.find((plate) => plate.id === viewer.treated_plate_id)
    : undefined

  return (
    <div className="event-media">
      <div className="row-between event-media__head">
        <h3 className="field__label event-media__title">תיעוד מצולם</h3>
        {canWrite ? (
          <p className="t-caption text-muted">
            {items.length}/{EVENT_MEDIA_CAP}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="field__hint field__hint--error" role="alert">
          {error}
        </p>
      ) : null}

      {items.length === 0 && drafts.length === 0 && showEmptyCopy ? (
        <p className="t-body text-muted">{EVENT_MEDIA_EMPTY_DETAIL}</p>
      ) : null}

      <MediaBand
        heading={EVENT_MEDIA_TAKEN_WHEN_LABEL.before_treatment}
        items={grouped.before}
        onOpen={openViewer}
      />
      <MediaBand
        heading={EVENT_MEDIA_TAKEN_WHEN_LABEL.during_after_treatment}
        items={grouped.during}
        onOpen={openViewer}
      />

      {drafts.length > 0 ? (
        <ul className="event-media__drafts">
          {drafts.map((draft) => (
            <li key={draft.key} className="event-media__draft">
              <img src={draft.previewUrl} alt="" className="event-media__draft-thumb" />
              <div className="event-media__draft-fields">
                {plates.length > 0 ? (
                  <SelectField
                    label="רכב"
                    value={draft.treatedPlateId}
                    disabled={draft.uploading}
                    options={plateOptions(plates)}
                    onChange={(event) => patchDraft(draft.key, { treatedPlateId: event.target.value })}
                  />
                ) : null}
                <TextField
                  label="תיאור"
                  placeholder="למשל: פגיעה בגלגל קדמי"
                  value={draft.caption}
                  disabled={draft.uploading}
                  maxLength={200}
                  onChange={(event) => patchDraft(draft.key, { caption: event.target.value })}
                />
                <SelectField
                  label="מתי צולמה"
                  required
                  placeholder="בחירה"
                  value={draft.takenWhen}
                  disabled={draft.uploading}
                  options={TAKEN_WHEN_OPTIONS}
                  onChange={(event) => {
                    const value = event.target.value as EventMediaTakenWhen
                    if (value !== 'before_treatment' && value !== 'during_after_treatment') return
                    void startUpload(draft.key, value)
                  }}
                />
                {draft.error ? (
                  <p className="field__hint field__hint--error" role="alert">
                    {draft.error}
                  </p>
                ) : null}
                {draft.uploading ? (
                  <p className="t-caption text-muted">מעלה…</p>
                ) : null}
                <div className="event-media__draft-actions">
                  {draft.error ? (
                    <Button
                      variant="secondary"
                      disabled={!draft.takenWhen}
                      onClick={() => {
                        if (
                          draft.takenWhen === 'before_treatment' ||
                          draft.takenWhen === 'during_after_treatment'
                        ) {
                          void startUpload(draft.key, draft.takenWhen)
                        }
                      }}
                    >
                      נסו שוב
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    disabled={draft.uploading}
                    onClick={() => removeDraft(draft.key)}
                  >
                    הסרה
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {canWrite ? (
        <div className="event-media__add">
          <input
            id={inputId}
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            disabled={!addEnabled}
            onChange={(event) => onPick(event.target.files)}
          />
          <Button
            variant="secondary"
            disabled={!addEnabled}
            icon={<ImagePlus size={20} strokeWidth={1.75} />}
            onClick={() => inputRef.current?.click()}
          >
            הוספת תמונות
          </Button>
          {!addEnabled ? (
            <p className="field__hint">{EVENT_MEDIA_CAP_ERROR}</p>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={Boolean(viewer)}
        title={
          confirmDelete
            ? 'למחוק את התמונה?'
            : viewer
              ? EVENT_MEDIA_TAKEN_WHEN_LABEL[viewer.taken_when]
              : 'תמונה'
        }
        form={editing}
        onClose={() => {
          if (deleting || savingEdit) return
          setViewer(null)
          setEditing(false)
          setConfirmDelete(false)
        }}
        footer={
          viewer && confirmDelete ? (
            <>
              <Button variant="destructive" loading={deleting} loadingLabel="מוחק…" onClick={() => void onDelete()}>
                מחיקה
              </Button>
              <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                ביטול
              </Button>
            </>
          ) : viewer && editing ? (
            <>
              <Button loading={savingEdit} loadingLabel="שומר…" onClick={() => void onSaveEdit()}>
                שמירה
              </Button>
              <Button variant="secondary" disabled={savingEdit} onClick={() => setEditing(false)}>
                ביטול
              </Button>
            </>
          ) : ownViewer ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                עריכה
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                מחיקה
              </Button>
            </>
          ) : undefined
        }
      >
        {viewer && confirmDelete ? (
          <p className="t-body">לא ניתן לשחזר.</p>
        ) : viewer && editing ? (
          <div className="stack-4">
            <SelectField
              label="מתי צולמה"
              required
              value={editTakenWhen}
              options={TAKEN_WHEN_OPTIONS}
              onChange={(event) => setEditTakenWhen(event.target.value as EventMediaTakenWhen)}
            />
            {plates.length > 0 ? (
              <SelectField
                label="רכב"
                value={editPlateId}
                options={plateOptions(plates)}
                onChange={(event) => setEditPlateId(event.target.value)}
              />
            ) : null}
            <TextField
              label="תיאור"
              placeholder="למשל: פגיעה בגלגל קדמי"
              value={editCaption}
              error={editError}
              maxLength={200}
              onChange={(event) => {
                setEditCaption(event.target.value)
                setEditError(undefined)
              }}
            />
          </div>
        ) : viewer ? (
          <div className="event-media__lightbox">
            {viewer.signed_url ? (
              <img src={viewer.signed_url} alt={viewer.caption ?? ''} className="event-media__full" />
            ) : (
              <p className="t-body text-muted">{EVENT_MEDIA_NETWORK}</p>
            )}
            {linkedPlate ? (
              <div className="event-media__lightbox-plate">
                <LicensePlate plate={linkedPlate.plate_number} size="sm" />
              </div>
            ) : null}
            {viewer.caption ? <p className="t-body">{viewer.caption}</p> : null}
            <p className="t-caption text-muted">
              {[viewer.uploader_name, formatDateTime(viewer.created_at)].filter(Boolean).join(' · ')}
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}

function MediaBand({
  heading,
  items,
  onOpen,
}: {
  heading: string
  items: EventMedia[]
  onOpen: (item: EventMedia) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="event-media__band">
      <h4 className="event-media__band-title t-label text-secondary">{heading}</h4>
      <ul className="event-media__grid">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="event-media__thumb" onClick={() => onOpen(item)}>
              {item.signed_url ? (
                <img src={item.signed_url} alt={item.caption ?? heading} />
              ) : (
                <span className="event-media__thumb-miss" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
