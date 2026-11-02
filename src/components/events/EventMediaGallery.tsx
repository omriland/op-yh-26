import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { Camera, ImagePlus, Play } from 'lucide-react'
import { compressEventImage } from '../../lib/compressEventImage'
import { eventMediaFileInputAttributes } from '../../lib/eventMediaFileInput'
import {
  EVENT_MEDIA_ADDED,
  EVENT_MEDIA_BAD_TYPE,
  EVENT_MEDIA_CAP,
  EVENT_MEDIA_CAP_ERROR,
  EVENT_MEDIA_DELETED,
  EVENT_MEDIA_EMPTY_DETAIL,
  EVENT_MEDIA_NETWORK,
  EVENT_MEDIA_TAKEN_WHEN_LABEL,
  EVENT_MEDIA_TITLE,
  EVENT_MEDIA_UPDATED,
  EVENT_MEDIA_VIDEO_ADDED,
  EVENT_MEDIA_VIDEO_DELETED,
  canAddMoreMedia,
  captionError,
  deleteEventMedia,
  eventMediaKind,
  isVideoMedia,
  pickEventMediaFiles,
  rejectVideoFile,
  groupMediaByTakenWhen,
  listEventMedia,
  listEventMediaPlates,
  slotsRemaining,
  updateEventMedia,
  uploadEventMedia,
  type EventMedia,
  type EventMediaKind,
  type EventMediaPlateOption,
  type EventMediaTakenWhen,
} from '../../lib/eventMedia'
import { formatDateTime, formatPlate } from '../../lib/format'
import { treatedPlateCaption } from '../../lib/treatedPlates'
import { useIsDesktop } from '../../lib/useMediaQuery'
import { Button } from '../ui/Button'
import { AlertDialog } from '../ui/AlertDialog'
import { Dialog } from '../ui/Dialog'
import { LicensePlate } from '../ui/LicensePlate'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { CarLogo } from './CarLogo'

export type EventMediaGalleryProps = {
  eventId: string
  canWrite: boolean
  showEmptyCopy: boolean
  viewerId: string | null
  error?: string
  onUnfinishedChange?: (count: number) => void
  /** Increment to drop the last unfinished, not-yet-uploading photo. */
  dropUnfinishedTick?: number
}

type MediaDraft = {
  key: string
  kind: EventMediaKind
  file: File
  previewUrl: string
  takenWhen: '' | EventMediaTakenWhen
  treatedPlateIds: string[]
  caption: string
  uploading: boolean
  error?: string
}

const TAKEN_WHEN_OPTIONS = (
  Object.entries(EVENT_MEDIA_TAKEN_WHEN_LABEL) as [EventMediaTakenWhen, string][]
).map(([value, label]) => ({ value, label }))

/** Seek a hair past 0 so Safari paints the first frame instead of a blank box. */
function videoPosterSrc(url: string): string {
  return `${url}#t=0.1`
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function mediaPlateLabel(plate: EventMediaPlateOption): string {
  const caption = treatedPlateCaption(plate.model, plate.color)
  const plateLabel = formatPlate(plate.plate_number)
  return caption ? `${plateLabel} ${caption}` : plateLabel
}

function MediaPlateChoice({ plate }: { plate: EventMediaPlateOption }) {
  const caption = treatedPlateCaption(plate.model, plate.color)
  return (
    <span className="media-plate-choice">
      <CarLogo slug={plate.logo_slug} />
      <LicensePlate plate={plate.plate_number} size="sm" />
      {caption ? (
        <span className="media-plate-choice__caption t-caption text-secondary">{caption}</span>
      ) : null}
    </span>
  )
}

function MediaPlateSelect({
  plates,
  value,
  disabled,
  onChange,
}: {
  plates: readonly EventMediaPlateOption[]
  value: string[]
  disabled?: boolean
  onChange: (ids: string[]) => void
}) {
  if (plates.length === 0) return null
  return (
    <SelectField
      label="רכבים בתמונה"
      multiple
      placeholder="בחירה"
      values={value}
      disabled={disabled}
      options={plates.map((plate) => ({
        value: plate.id,
        label: mediaPlateLabel(plate),
        content: <MediaPlateChoice plate={plate} />,
      }))}
      onValuesChange={onChange}
    />
  )
}

export function EventMediaGallery({
  eventId,
  canWrite,
  showEmptyCopy,
  viewerId,
  error,
  onUnfinishedChange,
  dropUnfinishedTick = 0,
}: EventMediaGalleryProps) {
  const uploadInputId = useId()
  const cameraInputId = useId()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { show } = useToast()
  const isDesktop = useIsDesktop()
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const [items, setItems] = useState<EventMedia[]>([])
  const [plates, setPlates] = useState<EventMediaPlateOption[]>([])
  const [drafts, setDrafts] = useState<MediaDraft[]>([])
  const [viewer, setViewer] = useState<EventMedia | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTakenWhen, setEditTakenWhen] = useState<EventMediaTakenWhen>('before_treatment')
  const [editPlateIds, setEditPlateIds] = useState<string[]>([])
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
    if (dropUnfinishedTick <= 0) return
    setDrafts((current) => {
      const last = [...current]
        .reverse()
        .find((draft) => !draft.takenWhen && !draft.uploading)
      if (!last) return current
      URL.revokeObjectURL(last.previewUrl)
      return current.filter((draft) => draft.key !== last.key)
    })
  }, [dropUnfinishedTick])

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
    let payload: { blob: Blob; mimeType: string; width: number | null; height: number | null }
    if (draft.kind === 'video') {
      const rejected = rejectVideoFile(draft.file)
      if (rejected) {
        patchDraft(key, { uploading: false, error: rejected })
        return
      }
      payload = { blob: draft.file, mimeType: draft.file.type, width: null, height: null }
    } else {
      const compressed = await compressEventImage(draft.file)
      if (!compressed.ok) {
        patchDraft(key, { uploading: false, error: compressed.error })
        return
      }
      payload = {
        blob: compressed.blob,
        mimeType: 'image/jpeg',
        width: compressed.width,
        height: compressed.height,
      }
    }
    const latest = draftsRef.current.find((row) => row.key === key) ?? draft
    const result = await uploadEventMedia({
      eventId,
      ...payload,
      takenWhen,
      treatedPlateIds: latest.treatedPlateIds,
      caption: latest.caption.trim() || null,
    })
    if (!result.ok) {
      patchDraft(key, { uploading: false, error: result.error })
      return
    }
    URL.revokeObjectURL(draft.previewUrl)
    setDrafts((current) => current.filter((row) => row.key !== key))
    setItems((current) => [...current, result.media])
    show(draft.kind === 'video' ? EVENT_MEDIA_VIDEO_ADDED : EVENT_MEDIA_ADDED, 'done')
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return
    if (!addEnabled) {
      show(EVENT_MEDIA_CAP_ERROR, 'alert')
      return
    }
    // Every draft holds a slot, not only the ones already uploading.
    const remaining = slotsRemaining(items.length, drafts.length)
    const { accepted, unsupported, overCap } = pickEventMediaFiles(files, remaining)
    if (unsupported > 0) show(EVENT_MEDIA_BAD_TYPE, 'alert')
    else if (overCap > 0) show(EVENT_MEDIA_CAP_ERROR, 'alert')
    if (accepted.length === 0) return
    const next: MediaDraft[] = accepted.map((file) => ({
      key: crypto.randomUUID(),
      kind: eventMediaKind(file) ?? 'image',
      file,
      previewUrl: URL.createObjectURL(file),
      takenWhen: '',
      treatedPlateIds: [],
      caption: '',
      uploading: false,
    }))
    setDrafts((current) => [...current, ...next])
    void listEventMediaPlates(eventId).then(setPlates)
  }

  function onPick(fileList: FileList | null, input: HTMLInputElement | null) {
    if (fileList) addFiles(Array.from(fileList))
    if (input) input.value = ''
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDragging(true)
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = addEnabled ? 'copy' : 'none'
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragging(false)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
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
    setEditPlateIds(item.treated_plate_ids)
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
      treatedPlateIds: editPlateIds,
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
      treated_plate_ids: editPlateIds,
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
    show(isVideoMedia(viewer.mime_type) ? EVENT_MEDIA_VIDEO_DELETED : EVENT_MEDIA_DELETED, 'done')
  }

  const ownViewer = Boolean(viewer && viewerId && viewer.uploaded_by === viewerId && canWrite)
  const linkedPlates = viewer
    ? plates.filter((plate) => viewer.treated_plate_ids.includes(plate.id))
    : []

  const viewerIsVideo = Boolean(viewer && isVideoMedia(viewer.mime_type))

  return (
    <div
      className={dragging ? 'event-media event-media--dragging' : 'event-media'}
      {...(canWrite ? { onDragEnter, onDragOver, onDragLeave, onDrop } : {})}
    >
      {dragging ? (
        <div className="event-media__drop" aria-hidden="true">
          <p className="t-body">{addEnabled ? 'שחררו כאן כדי לצרף' : EVENT_MEDIA_CAP_ERROR}</p>
        </div>
      ) : null}
      <div className="row-between event-media__head">
        <h3 className="field__label event-media__title">{EVENT_MEDIA_TITLE}</h3>
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
              {draft.kind === 'video' ? (
                <video
                  src={videoPosterSrc(draft.previewUrl)}
                  className="event-media__draft-thumb"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img src={draft.previewUrl} alt="" className="event-media__draft-thumb" />
              )}
              <div className="event-media__draft-fields">
                <MediaPlateSelect
                  plates={plates}
                  value={draft.treatedPlateIds}
                  disabled={draft.uploading}
                  onChange={(ids) => patchDraft(draft.key, { treatedPlateIds: ids })}
                />
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
            id={uploadInputId}
            ref={uploadInputRef}
            className="visually-hidden"
            type="file"
            disabled={!addEnabled}
            onChange={(event) => onPick(event.target.files, event.target)}
            {...eventMediaFileInputAttributes('upload')}
          />
          <input
            id={cameraInputId}
            ref={cameraInputRef}
            className="visually-hidden"
            type="file"
            disabled={!addEnabled}
            onChange={(event) => onPick(event.target.files, event.target)}
            {...eventMediaFileInputAttributes('camera')}
          />
          <div className="event-media__add-actions">
            <Button
              variant="secondary"
              disabled={!addEnabled}
              icon={<ImagePlus size={20} strokeWidth={1.75} />}
              onClick={() => uploadInputRef.current?.click()}
            >
              הוספת תמונות וסרטונים
            </Button>
            <Button
              variant="secondary"
              disabled={!addEnabled}
              icon={<Camera size={20} strokeWidth={1.75} />}
              onClick={() => cameraInputRef.current?.click()}
            >
              צילום תמונה
            </Button>
          </div>
          {!addEnabled ? (
            <p className="field__hint">{EVENT_MEDIA_CAP_ERROR}</p>
          ) : isDesktop ? (
            <p className="field__hint">אפשר גם לגרור לכאן תמונות וסרטונים קצרים.</p>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={Boolean(viewer) && !confirmDelete}
        title={viewer ? EVENT_MEDIA_TAKEN_WHEN_LABEL[viewer.taken_when] : 'מדיה'}
        form={false}
        wide
        onClose={() => {
          if (savingEdit) return
          setViewer(null)
          setEditing(false)
        }}
        footer={
          viewer && editing ? (
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
        {viewer ? (
          <div className="event-media__lightbox">
            {viewer.signed_url && viewerIsVideo ? (
              <video
                src={viewer.signed_url}
                className="event-media__full"
                controls
                playsInline
                preload="metadata"
                aria-label={viewer.caption ?? 'סרטון'}
              />
            ) : viewer.signed_url ? (
              <img src={viewer.signed_url} alt={viewer.caption ?? ''} className="event-media__full" />
            ) : (
              <p className="t-body text-muted">{EVENT_MEDIA_NETWORK}</p>
            )}
            <div className="event-media__side">
              {editing ? (
                <div className="stack-4">
                  <SelectField
                    label="מתי צולמה"
                    required
                    value={editTakenWhen}
                    options={TAKEN_WHEN_OPTIONS}
                    onChange={(event) => setEditTakenWhen(event.target.value as EventMediaTakenWhen)}
                  />
                  <MediaPlateSelect
                    plates={plates}
                    value={editPlateIds}
                    onChange={setEditPlateIds}
                  />
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
              ) : (
                <>
                  <dl className="event-media__meta">
                    <div className="event-media__meta-row">
                      <dt className="t-label text-secondary">תיאור</dt>
                      <dd className="t-body">{viewer.caption?.trim() || '—'}</dd>
                    </div>
                    <div className="event-media__meta-row">
                      <dt className="t-label text-secondary">רכבים בתמונה</dt>
                      <dd>
                        {linkedPlates.length > 0 ? (
                          <ul className="event-media__plate-list">
                            {linkedPlates.map((plate) => (
                              <li key={plate.id}>
                                <MediaPlateChoice plate={plate} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="t-body">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p className="t-caption text-muted">
                    {[viewer.uploader_name, formatDateTime(viewer.created_at)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>

      <AlertDialog
        open={confirmDelete}
        status="danger"
        title={viewerIsVideo ? 'למחוק את הסרטון?' : 'למחוק את התמונה?'}
        busy={deleting}
        onClose={() => {
          if (!deleting) setConfirmDelete(false)
        }}
        footer={
          <>
            <Button variant="destructive" loading={deleting} loadingLabel="מוחק…" onClick={() => void onDelete()}>
              מחיקה
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">לא ניתן לשחזר.</p>
      </AlertDialog>
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
            <button
              type="button"
              className="event-media__thumb"
              aria-label={isVideoMedia(item.mime_type) ? `סרטון: ${item.caption ?? heading}` : undefined}
              onClick={() => onOpen(item)}
            >
              {item.signed_url && isVideoMedia(item.mime_type) ? (
                <>
                  <video
                    src={videoPosterSrc(item.signed_url)}
                    muted
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span className="event-media__play" aria-hidden="true">
                    <Play size={16} strokeWidth={1.75} />
                  </span>
                </>
              ) : item.signed_url ? (
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
