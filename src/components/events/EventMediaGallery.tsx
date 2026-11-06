import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { Check, ImagePlus, Play } from 'lucide-react'
import { compressEventImage } from '../../lib/compressEventImage'
import { heicToJpegFile, isHeicFile } from '../../lib/heicImage'
import { eventMediaFileInputAttributes } from '../../lib/eventMediaFileInput'
import {
  EVENT_MEDIA_ADDED,
  EVENT_MEDIA_BAD_TYPE,
  EVENT_MEDIA_CAP,
  EVENT_MEDIA_CAP_ERROR,
  EVENT_MEDIA_DELETED,
  EVENT_MEDIA_EMPTY_DETAIL,
  EVENT_MEDIA_HEIC_FAIL,
  EVENT_MEDIA_NETWORK,
  EVENT_MEDIA_TAKEN_WHEN_LABEL,
  EVENT_MEDIA_TITLE,
  EVENT_MEDIA_UPDATED,
  EVENT_MEDIA_VIDEO_ADDED,
  EVENT_MEDIA_VIDEO_DELETED,
  EVENT_MEDIA_STEP_TITLE,
  EVENT_MEDIA_VEHICLE_PROMPT,
  canAddMoreMedia,
  canDeleteEventMedia,
  captionError,
  nextPhotoVehicleId,
  photoAttachWrite,
  photoStepCanSave,
  photoStepVehicleNote,
  deleteEventMedia,
  eventMediaKind,
  isVideoMedia,
  pickEventMediaFiles,
  rejectVideoFile,
  groupMediaByTakenWhen,
  listEventMedia,
  listEventMediaPlates,
  replaceMediaPlates,
  slotsRemaining,
  updateEventMedia,
  uploadEventMedia,
  type EventMedia,
  type EventMediaKind,
  type EventMediaPlateOption,
  type EventMediaTakenWhen,
} from '../../lib/eventMedia'
import { formatDateTime, formatPlate } from '../../lib/format'
import {
  PLATE_LINK_ACTION,
  PLATE_LINK_HINT,
  PLATE_LINK_SAVED,
  PLATE_SCAN_ADD,
  PLATE_SCAN_ADDED,
  PLATE_SCAN_DISMISS,
  PLATE_SCAN_HINT,
  PLATE_SCAN_TITLE,
  addPlateSuggestions,
  scanPlatesInMedia,
  visiblePlateSuggestions,
} from '../../lib/plateScan'
import { OVERFLOW_MENU_GAP, OVERFLOW_MENU_MIN_WIDTH } from '../../lib/overflowMenuPlacement'
import { treatedPlateCaption } from '../../lib/treatedPlates'
import { useIsDesktop } from '../../lib/useMediaQuery'
import { Button } from '../ui/Button'
import { AlertDialog } from '../ui/AlertDialog'
import { Dialog } from '../ui/Dialog'
import { LicensePlate } from '../ui/LicensePlate'
import { PointerContextMenu } from '../ui/PointerContextMenu'
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
  /** Plates in the form being filled (saved or not). Suggestions skip these. */
  formPlates?: readonly string[]
  /**
   * When set, each uploaded photo is scanned for plates and new ones are offered here.
   * Returns an error message, or null when the plate was added to the form.
   */
  onAddScannedPlate?: (digits: string) => string | null
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
  /** HEIC photo still being converted to JPEG; no preview yet. */
  preparing?: boolean
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

/** One tap links the photo to a treated vehicle already on the event. */
function MediaPlateChips({
  plates,
  value,
  disabled,
  single = false,
  onChange,
}: {
  plates: readonly EventMediaPlateOption[]
  value: string[]
  disabled?: boolean
  /** One vehicle for a new photo. Editing still allows several. */
  single?: boolean
  onChange: (ids: string[]) => void
}) {
  const labelId = useId()
  if (plates.length === 0) return null
  return (
    <div className="field">
      <p id={labelId} className="field__label">
        {single ? EVENT_MEDIA_VEHICLE_PROMPT : 'רכבים בתמונה'}
      </p>
      <div
        className="media-plate-chips"
        role={single ? 'radiogroup' : 'group'}
        aria-labelledby={labelId}
      >
        {plates.map((plate) => {
          const selected = value.includes(plate.id)
          return (
            <button
              key={plate.id}
              type="button"
              className="media-plate-chip"
              role={single ? 'radio' : undefined}
              aria-pressed={single ? undefined : selected}
              aria-checked={single ? selected : undefined}
              aria-label={mediaPlateLabel(plate)}
              disabled={disabled}
              onClick={() =>
                onChange(
                  single
                    ? [plate.id]
                    : selected
                      ? value.filter((id) => id !== plate.id)
                      : [...value, plate.id],
                )
              }
            >
              {selected ? (
                <Check size={16} strokeWidth={2} aria-hidden="true" className="media-plate-chip__check" />
              ) : null}
              <MediaPlateChoice plate={plate} />
            </button>
          )
        })}
      </div>
    </div>
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
  formPlates = [],
  onAddScannedPlate,
}: EventMediaGalleryProps) {
  const [plateSuggestions, setPlateSuggestions] = useState<string[]>([])
  const [dismissedPlates, setDismissedPlates] = useState<string[]>([])
  const uploadInputId = useId()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const { show } = useToast()
  const isDesktop = useIsDesktop()
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const [items, setItems] = useState<EventMedia[]>([])
  const [plates, setPlates] = useState<EventMediaPlateOption[]>([])
  const [platesLoaded, setPlatesLoaded] = useState(false)
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
  const [deleteFromTile, setDeleteFromTile] = useState(false)
  const [tileMenu, setTileMenu] = useState<{
    item: EventMedia
    tile: HTMLButtonElement
    x: number
    y: number
  } | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const platesRef = useRef(plates)
  platesRef.current = plates
  const [linkTarget, setLinkTarget] = useState<EventMedia | null>(null)
  const [linkPlateIds, setLinkPlateIds] = useState<string[]>([])
  const [linkError, setLinkError] = useState<string | undefined>()
  const [savingLink, setSavingLink] = useState(false)
  const inFlight = drafts.filter((draft) => draft.uploading).length
  const addEnabled = canWrite && canAddMoreMedia(items.length, inFlight)

  useEffect(() => {
    let active = true
    setPlatesLoaded(false)
    void listEventMedia(eventId).then((rows) => {
      if (active) setItems(rows)
    })
    void listEventMediaPlates(eventId).then((rows) => {
      if (!active) return
      setPlates(rows)
      setPlatesLoaded(true)
    })
    return () => {
      active = false
    }
  }, [eventId])

  useEffect(() => {
    if (!platesLoaded) return
    const ids = plates.map((plate) => plate.id)
    setDrafts((current) => {
      let changed = false
      const next = current.map((draft) => {
        if (draft.uploading) return draft
        const vehicleId = nextPhotoVehicleId(ids, draft.treatedPlateIds[0] ?? null)
        const same =
          (draft.treatedPlateIds[0] ?? null) === vehicleId && draft.treatedPlateIds.length <= 1
        if (same) return draft
        changed = true
        return { ...draft, treatedPlateIds: vehicleId ? [vehicleId] : [] }
      })
      return changed ? next : current
    })
  }, [plates, platesLoaded])

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

  async function startUpload(
    key: string,
    takenWhen: EventMediaTakenWhen,
    write: ReturnType<typeof photoAttachWrite>,
  ) {
    const draft = draftsRef.current.find((row) => row.key === key)
    if (!draft || write.blocked) return
    patchDraft(key, {
      uploading: true,
      error: undefined,
      takenWhen,
      treatedPlateIds: write.vehicleIds,
      caption: write.caption ?? '',
    })
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
    const result = await uploadEventMedia({
      eventId,
      ...payload,
      takenWhen,
      treatedPlateIds: write.vehicleIds,
      caption: write.caption,
    })
    if (!result.ok) {
      patchDraft(key, { uploading: false, error: result.error })
      return
    }
    URL.revokeObjectURL(draft.previewUrl)
    setDrafts((current) => current.filter((row) => row.key !== key))
    setItems((current) => [...current, result.media])
    show(draft.kind === 'video' ? EVENT_MEDIA_VIDEO_ADDED : EVENT_MEDIA_ADDED, 'done')
    // A readable plate can be offered as a new vehicle. It is never linked to this photo.
    if (draft.kind === 'image' && onAddScannedPlate) {
      void scanPlatesInMedia(result.media.id).then((found) => {
        if (found.length === 0) return
        setPlateSuggestions((current) => addPlateSuggestions(current, found))
      })
    }
  }

  function setItemPlates(mediaId: string, plateIds: string[]) {
    setItems((current) =>
      current.map((row) => (row.id === mediaId ? { ...row, treated_plate_ids: plateIds } : row)),
    )
  }

  function openLink(item: EventMedia) {
    setLinkTarget(item)
    setLinkPlateIds(item.treated_plate_ids)
    setLinkError(undefined)
  }

  async function onSaveLink() {
    if (!linkTarget) return
    setSavingLink(true)
    const result = await replaceMediaPlates(linkTarget.id, linkPlateIds)
    setSavingLink(false)
    if (!result.ok) {
      setLinkError(result.error)
      return
    }
    setItemPlates(linkTarget.id, linkPlateIds)
    setLinkTarget(null)
    show(PLATE_LINK_SAVED, 'done')
  }

  function addScannedPlate(digits: string) {
    if (!onAddScannedPlate) return
    const failure = onAddScannedPlate(digits)
    if (failure) {
      show(failure, 'alert')
      return
    }
    show(PLATE_SCAN_ADDED, 'done')
  }

  function dismissScannedPlate(digits: string) {
    setDismissedPlates((current) => [...current, digits])
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
    const presetVehicleId = nextPhotoVehicleId(
      platesRef.current.map((plate) => plate.id),
      null,
    )
    const next: MediaDraft[] = accepted.map((file) => {
      const heic = isHeicFile(file)
      return {
        key: crypto.randomUUID(),
        kind: eventMediaKind(file) ?? 'image',
        file,
        previewUrl: heic ? '' : URL.createObjectURL(file),
        takenWhen: '',
        treatedPlateIds: presetVehicleId ? [presetVehicleId] : [],
        caption: '',
        uploading: false,
        preparing: heic,
      }
    })
    setDrafts((current) => [...current, ...next])
    void listEventMediaPlates(eventId).then((rows) => {
      setPlates(rows)
      setPlatesLoaded(true)
    })
    for (const draft of next) {
      if (draft.preparing) void prepareHeicDraft(draft.key, draft.file)
    }
  }

  async function prepareHeicDraft(key: string, file: File) {
    const jpeg = await heicToJpegFile(file)
    if (!jpeg) {
      patchDraft(key, { preparing: false, error: EVENT_MEDIA_HEIC_FAIL })
      return
    }
    patchDraft(key, { preparing: false, file: jpeg, previewUrl: URL.createObjectURL(jpeg) })
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
    setDeleteFromTile(false)
    setEditTakenWhen(item.taken_when)
    setEditPlateIds(item.treated_plate_ids)
    setEditCaption(item.caption ?? '')
    setEditError(undefined)
  }

  function openTile(item: EventMedia, tile: HTMLButtonElement) {
    if (!canDeleteEventMedia(item, viewerId, canWrite)) {
      openViewer(item)
      return
    }
    // Anchor under the tile, flush with its inline-start (right) edge.
    const rect = tile.getBoundingClientRect()
    setTileMenu({
      item,
      tile,
      x: rect.right - OVERFLOW_MENU_MIN_WIDTH,
      y: rect.bottom + OVERFLOW_MENU_GAP,
    })
  }

  function removeFromTile(item: EventMedia) {
    openViewer(item)
    setDeleteFromTile(true)
    setConfirmDelete(true)
  }

  function cancelDelete() {
    setConfirmDelete(false)
    // From the tile menu, cancelling goes back to the grid, not into the viewer.
    if (deleteFromTile) setViewer(null)
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

  const stepDraft = drafts[0] ?? null
  const stepCanSave = stepDraft
    ? photoStepCanSave({
        caption: stepDraft.caption,
        takenWhen: stepDraft.takenWhen,
        preparing: Boolean(stepDraft.preparing),
        platesLoaded,
      })
    : false
  const stepVehicleNote = platesLoaded ? photoStepVehicleNote(plates.length) : null

  function saveStep() {
    const draft = draftsRef.current[0]
    if (!draft) return
    if (draft.takenWhen !== 'before_treatment' && draft.takenWhen !== 'during_after_treatment') return
    if (
      !photoStepCanSave({
        caption: draft.caption,
        takenWhen: draft.takenWhen,
        preparing: Boolean(draft.preparing),
        platesLoaded,
      })
    ) {
      return
    }
    void startUpload(
      draft.key,
      draft.takenWhen,
      photoAttachWrite({
        caption: draft.caption,
        vehicleId: draft.treatedPlateIds[0] ?? null,
      }),
    )
  }

  const ownViewer = Boolean(viewer && canDeleteEventMedia(viewer, viewerId, canWrite))
  const linkedPlates = viewer
    ? plates.filter((plate) => viewer.treated_plate_ids.includes(plate.id))
    : []

  const viewerIsVideo = Boolean(viewer && isVideoMedia(viewer.mime_type))

  const shownPlateSuggestions =
    onAddScannedPlate && canWrite
      ? visiblePlateSuggestions(plateSuggestions, {
          eventPlates: plates.map((plate) => plate.plate_number),
          formPlates,
          dismissed: dismissedPlates,
        })
      : []

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
        hasMenu={(item) => canDeleteEventMedia(item, viewerId, canWrite)}
        menuOpenFor={tileMenu?.item.id ?? null}
        onOpen={openTile}
      />
      <MediaBand
        heading={EVENT_MEDIA_TAKEN_WHEN_LABEL.during_after_treatment}
        items={grouped.during}
        hasMenu={(item) => canDeleteEventMedia(item, viewerId, canWrite)}
        menuOpenFor={tileMenu?.item.id ?? null}
        onOpen={openTile}
      />

      {shownPlateSuggestions.length > 0 ? (
        <section className="plate-scan" aria-live="polite">
          <div className="plate-scan__head">
            <h4 className="t-label">{PLATE_SCAN_TITLE}</h4>
            <p className="t-caption text-muted">{PLATE_SCAN_HINT}</p>
          </div>
          <ul className="plate-scan__list">
            {shownPlateSuggestions.map((digits) => (
              <li key={digits} className="plate-scan__item">
                <LicensePlate plate={formatPlate(digits)} size="sm" />
                <div className="plate-scan__actions">
                  <Button variant="secondary" onClick={() => addScannedPlate(digits)}>
                    {PLATE_SCAN_ADD}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`${PLATE_SCAN_DISMISS}: ${formatPlate(digits)}`}
                    onClick={() => dismissScannedPlate(digits)}
                  >
                    {PLATE_SCAN_DISMISS}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
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
            {...eventMediaFileInputAttributes}
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
          </div>
          {!addEnabled ? (
            <p className="field__hint">{EVENT_MEDIA_CAP_ERROR}</p>
          ) : isDesktop ? (
            <p className="field__hint">אפשר גם לגרור לכאן תמונות וסרטונים קצרים.</p>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={Boolean(stepDraft)}
        title={EVENT_MEDIA_STEP_TITLE}
        onClose={() => {
          if (!stepDraft || stepDraft.uploading) return
          removeDraft(stepDraft.key)
        }}
        footer={
          stepDraft ? (
            <>
              <Button
                loading={stepDraft.uploading}
                loadingLabel="שומר…"
                disabled={!stepCanSave}
                onClick={saveStep}
              >
                שמירה
              </Button>
              <Button
                variant="secondary"
                disabled={stepDraft.uploading}
                onClick={() => removeDraft(stepDraft.key)}
              >
                ביטול
              </Button>
            </>
          ) : undefined
        }
      >
        {stepDraft ? (
          <div className="stack-3">
            <div className="event-media__draft">
              {stepDraft.kind === 'video' ? (
                <video
                  src={videoPosterSrc(stepDraft.previewUrl)}
                  className="event-media__draft-thumb"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : stepDraft.preparing ? (
                <div className="event-media__draft-thumb event-media__draft-thumb--preparing">
                  <span className="t-caption text-muted">מכין תמונה…</span>
                </div>
              ) : stepDraft.previewUrl ? (
                <img src={stepDraft.previewUrl} alt="" className="event-media__draft-thumb" />
              ) : (
                <div className="event-media__draft-thumb event-media__draft-thumb--preparing" />
              )}
              <div className="event-media__draft-fields">
                {!platesLoaded ? (
                  <p className="t-caption text-muted">טוען רכבים…</p>
                ) : stepVehicleNote ? (
                  <p className="t-body text-secondary">{stepVehicleNote}</p>
                ) : (
                  <MediaPlateChips
                    single
                    plates={plates}
                    value={stepDraft.treatedPlateIds}
                    disabled={stepDraft.uploading}
                    onChange={(ids) => patchDraft(stepDraft.key, { treatedPlateIds: ids })}
                  />
                )}
                <TextField
                  label="תיאור"
                  hint="אופציונלי"
                  placeholder="למשל: פגיעה בגלגל קדמי"
                  value={stepDraft.caption}
                  disabled={stepDraft.uploading}
                  maxLength={200}
                  onChange={(event) => patchDraft(stepDraft.key, { caption: event.target.value })}
                />
                <SelectField
                  label="מתי צולמה"
                  required
                  placeholder="בחירה"
                  value={stepDraft.takenWhen}
                  disabled={stepDraft.uploading || stepDraft.preparing || !stepDraft.previewUrl}
                  options={TAKEN_WHEN_OPTIONS}
                  onChange={(event) => {
                    const value = event.target.value as EventMediaTakenWhen
                    if (value !== 'before_treatment' && value !== 'during_after_treatment') return
                    patchDraft(stepDraft.key, { takenWhen: value })
                  }}
                />
                {stepDraft.error ? (
                  <p className="field__hint field__hint--error" role="alert">
                    {stepDraft.error}
                  </p>
                ) : null}
                {drafts.length > 1 ? (
                  <p className="t-caption text-muted">אחרי השמירה אפשר לשייך את התמונה הבאה.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <PointerContextMenu
        open={Boolean(tileMenu)}
        pointer={tileMenu}
        label={tileMenu && isVideoMedia(tileMenu.item.mime_type) ? 'פעולות לסרטון' : 'פעולות לתמונה'}
        onClose={() => {
          tileMenu?.tile.focus()
          setTileMenu(null)
        }}
        items={
          tileMenu
            ? [
                { label: 'צפייה', onSelect: () => openViewer(tileMenu.item) },
                ...(plates.length > 0
                  ? [{ label: PLATE_LINK_ACTION, onSelect: () => openLink(tileMenu.item) }]
                  : []),
                { label: 'הסרה', danger: true, onSelect: () => removeFromTile(tileMenu.item) },
              ]
            : []
        }
      />

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
                  <MediaPlateChips
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

      <Dialog
        open={Boolean(linkTarget)}
        title={PLATE_LINK_ACTION}
        onClose={() => {
          if (!savingLink) setLinkTarget(null)
        }}
        footer={
          <>
            <Button loading={savingLink} loadingLabel="שומר…" onClick={() => void onSaveLink()}>
              שמירה
            </Button>
            <Button variant="secondary" disabled={savingLink} onClick={() => setLinkTarget(null)}>
              ביטול
            </Button>
          </>
        }
      >
        <div className="stack-3">
          <p className="t-body text-secondary">{PLATE_LINK_HINT}</p>
          <MediaPlateChips
            plates={plates}
            value={linkPlateIds}
            disabled={savingLink}
            onChange={(ids) => {
              setLinkPlateIds(ids)
              setLinkError(undefined)
            }}
          />
          {linkError ? (
            <p className="field__hint field__hint--error" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <AlertDialog
        open={confirmDelete}
        status="danger"
        title={viewerIsVideo ? 'למחוק את הסרטון?' : 'למחוק את התמונה?'}
        busy={deleting}
        onClose={() => {
          if (!deleting) cancelDelete()
        }}
        footer={
          <>
            <Button variant="destructive" loading={deleting} loadingLabel="מוחק…" onClick={() => void onDelete()}>
              מחיקה
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={cancelDelete}>
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
  hasMenu,
  menuOpenFor,
  onOpen,
}: {
  heading: string
  items: EventMedia[]
  hasMenu: (item: EventMedia) => boolean
  menuOpenFor: string | null
  onOpen: (item: EventMedia, tile: HTMLButtonElement) => void
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
              aria-haspopup={hasMenu(item) ? 'menu' : undefined}
              aria-expanded={hasMenu(item) ? menuOpenFor === item.id : undefined}
              onClick={(event) => onOpen(item, event.currentTarget)}
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
