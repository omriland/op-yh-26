import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
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
  EVENT_MEDIA_UNASSIGNED_LABEL,
  EVENT_MEDIA_PENDING_VEHICLE,
  PHOTO_UNASSIGNED,
  canAddMoreMedia,
  canDeleteEventMedia,
  captionError,
  keepPhotoSubject,
  photoAttachWrite,
  photoStepCanSave,
  photoStepVehicleNote,
  photoSubjectDigits,
  resolvePlateDigits,
  eventMediaKind,
  isVideoMedia,
  pickEventMediaFiles,
  rejectVideoFile,
  groupMediaByTakenWhen,
  slotsRemaining,
  type EventMedia,
  type EventMediaKind,
  type EventMediaPlateOption,
  type EventMediaTakenWhen,
  type MediaPlateOwner,
  type PendingMediaLink,
  type PhotoSubject,
} from '../../lib/eventMedia'
import { sessionMediaSource, type EventMediaSource } from '../../lib/eventMediaSource'
import { formatDateTime, formatPlate, plateDigits } from '../../lib/format'
import {
  PLATE_LINK_ACTION,
  PLATE_LINK_HINT,
  PLATE_LINK_SAVED,
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
  /**
   * Vehicles in the form being filled, saved or not. When set, photos are linked
   * to these (and only these). Without a form, the event's saved vehicles are used.
   */
  formVehicles?: readonly FormVehicle[]
  /** Whose report the form's vehicles are saved under. */
  plateOwner?: MediaPlateOwner
  /** Photos linked to a form vehicle that has no saved row yet. */
  onPendingLinksChange?: (links: PendingMediaLink[]) => void
  /** Increment after the form saved its vehicles, to re-read the photos' links. */
  vehiclesSavedTick?: number
  /** Where photos are read and written. Defaults to the signed-in session. */
  source?: EventMediaSource
}

export type FormVehicle = {
  plate_number: string
  model: string | null
  color: string | null
  logo_slug: string | null
}

type VehicleOption = FormVehicle & { digits: string }

function vehicleOptionsFrom(rows: readonly FormVehicle[]): VehicleOption[] {
  const seen = new Set<string>()
  const out: VehicleOption[] = []
  for (const row of rows) {
    const digits = plateDigits(row.plate_number)
    if (!digits || seen.has(digits)) continue
    seen.add(digits)
    out.push({ ...row, digits })
  }
  return out
}

type MediaDraft = {
  key: string
  kind: EventMediaKind
  file: File
  previewUrl: string
  takenWhen: '' | EventMediaTakenWhen
  subject: PhotoSubject
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

function mediaPlateLabel(plate: FormVehicle): string {
  const caption = treatedPlateCaption(plate.model, plate.color)
  const plateLabel = formatPlate(plate.plate_number)
  return caption ? `${plateLabel} ${caption}` : plateLabel
}

function MediaPlateChoice({ plate }: { plate: FormVehicle }) {
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

/**
 * What the photo shows: one of the form's vehicles, "not a vehicle", or no
 * assignment. A new photo takes one choice; editing allows several vehicles.
 */
function PhotoSubjectChips({
  vehicles,
  value,
  disabled,
  single = false,
  onChange,
}: {
  vehicles: readonly VehicleOption[]
  value: PhotoSubject
  disabled?: boolean
  single?: boolean
  onChange: (subject: PhotoSubject) => void
}) {
  const labelId = useId()
  const chosen = photoSubjectDigits(value)

  function chip(key: string, selected: boolean, label: string, onPick: () => void, body: ReactNode) {
    return (
      <button
        key={key}
        type="button"
        className="media-plate-chip"
        role={single ? 'radio' : undefined}
        aria-pressed={single ? undefined : selected}
        aria-checked={single ? selected : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={onPick}
      >
        {selected ? (
          <Check size={16} strokeWidth={2} aria-hidden="true" className="media-plate-chip__check" />
        ) : null}
        {body}
      </button>
    )
  }

  function pickVehicle(digits: string) {
    if (single) {
      onChange({ kind: 'vehicles', digits: [digits] })
      return
    }
    const next = chosen.includes(digits)
      ? chosen.filter((row) => row !== digits)
      : [...chosen, digits]
    onChange(next.length > 0 ? { kind: 'vehicles', digits: next } : PHOTO_UNASSIGNED)
  }

  return (
    <div className="field">
      <p id={labelId} className="field__label">
        {EVENT_MEDIA_VEHICLE_PROMPT}
      </p>
      <div
        className="media-plate-chips"
        role={single ? 'radiogroup' : 'group'}
        aria-labelledby={labelId}
      >
        {vehicles.map((vehicle) =>
          chip(
            vehicle.digits,
            chosen.includes(vehicle.digits),
            mediaPlateLabel(vehicle),
            () => pickVehicle(vehicle.digits),
            <MediaPlateChoice plate={vehicle} />,
          ),
        )}
        {/* One "no vehicle" choice. Older photos saved as not_vehicle show here too. */}
        {chip(
          'unassigned',
          value.kind !== 'vehicles',
          EVENT_MEDIA_UNASSIGNED_LABEL,
          () => onChange(PHOTO_UNASSIGNED),
          <span className="t-body">{EVENT_MEDIA_UNASSIGNED_LABEL}</span>,
        )}
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
  formVehicles,
  plateOwner,
  onPendingLinksChange,
  vehiclesSavedTick = 0,
  source = sessionMediaSource,
}: EventMediaGalleryProps) {
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
  const [editSubject, setEditSubject] = useState<PhotoSubject>(PHOTO_UNASSIGNED)
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
  const [linkTarget, setLinkTarget] = useState<EventMedia | null>(null)
  const [linkSubject, setLinkSubject] = useState<PhotoSubject>(PHOTO_UNASSIGNED)
  const [linkError, setLinkError] = useState<string | undefined>()
  const [savingLink, setSavingLink] = useState(false)
  /** Photo id to the form vehicles it waits for (no saved row yet). */
  const [pending, setPending] = useState<Record<string, string[]>>({})
  const inFlight = drafts.filter((draft) => draft.uploading).length
  const addEnabled = canWrite && canAddMoreMedia(items.length, inFlight)

  // The form's vehicles when there is a form; otherwise the event's saved ones.
  const vehicleOptions = vehicleOptionsFrom(formVehicles ?? plates)
  const vehicleDigits = vehicleOptions.map((vehicle) => vehicle.digits)
  const vehicleDigitsKey = vehicleDigits.join(',')
  const vehiclesReady = Boolean(formVehicles) || platesLoaded
  const owner = plateOwner ?? null

  useEffect(() => {
    let active = true
    setPlatesLoaded(false)
    void source.listMedia(eventId).then((rows) => {
      if (active) setItems(rows)
    })
    void source.listPlates(eventId).then((rows) => {
      if (!active) return
      setPlates(rows)
      setPlatesLoaded(true)
    })
    return () => {
      active = false
    }
  }, [eventId, source])

  // The form saved: plate rows were replaced, so re-read them and the photos' links.
  useEffect(() => {
    if (vehiclesSavedTick <= 0) return
    let active = true
    void Promise.all([source.listMedia(eventId), source.listPlates(eventId)]).then(
      ([rows, plateRows]) => {
        if (!active) return
        setItems(rows)
        setPlates(plateRows)
        setPlatesLoaded(true)
        const linkedDigits = new Map(
          rows.map((row) => [
            row.id,
            plateRows
              .filter((plate) => row.treated_plate_ids.includes(plate.id))
              .map((plate) => plateDigits(plate.plate_number)),
          ]),
        )
        setPending((current) => {
          const next: Record<string, string[]> = {}
          for (const [mediaId, digits] of Object.entries(current)) {
            const linked = linkedDigits.get(mediaId)
            if (!linked) continue
            const left = digits.filter((row) => !linked.includes(row))
            if (left.length > 0) next[mediaId] = left
          }
          return next
        })
      },
    )
    return () => {
      active = false
    }
  }, [eventId, source, vehiclesSavedTick])

  // A vehicle removed from the form takes its choice with it.
  useEffect(() => {
    if (!vehiclesReady) return
    const digits = vehicleDigitsKey ? vehicleDigitsKey.split(',') : []
    setDrafts((current) => {
      let changed = false
      const next = current.map((draft) => {
        if (draft.uploading) return draft
        const subject = keepPhotoSubject(draft.subject, digits)
        if (subject === draft.subject) return draft
        changed = true
        return { ...draft, subject }
      })
      return changed ? next : current
    })
  }, [vehicleDigitsKey, vehiclesReady])

  useEffect(() => {
    if (!onPendingLinksChange) return
    const digits = vehicleDigitsKey ? vehicleDigitsKey.split(',') : []
    onPendingLinksChange(
      Object.entries(pending).flatMap(([mediaId, waiting]) => {
        const kept = waiting.filter((row) => digits.includes(row))
        return kept.length > 0 ? [{ mediaId, digits: kept }] : []
      }),
    )
  }, [pending, vehicleDigitsKey, onPendingLinksChange])

  function setPendingFor(mediaId: string, digits: string[]) {
    setPending((current) => {
      const next = { ...current }
      if (digits.length > 0) next[mediaId] = digits
      else delete next[mediaId]
      return next
    })
  }

  /** The photo's current subject as the person sees it, limited to vehicles still in the form. */
  function subjectOf(item: EventMedia): PhotoSubject {
    if (item.not_vehicle) return { kind: 'not_vehicle' }
    const linked = plates
      .filter((plate) => item.treated_plate_ids.includes(plate.id))
      .map((plate) => plateDigits(plate.plate_number))
    const digits = [...new Set([...linked, ...(pending[item.id] ?? [])])]
    if (digits.length === 0) return PHOTO_UNASSIGNED
    return keepPhotoSubject({ kind: 'vehicles', digits }, vehicleDigits)
  }

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
      subject: write.subject,
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
    const result = await source.upload({
      eventId,
      ...payload,
      takenWhen,
      subject: write.subject,
      owner,
      caption: write.caption,
    })
    if (!result.ok) {
      patchDraft(key, { uploading: false, error: result.error })
      return
    }
    URL.revokeObjectURL(draft.previewUrl)
    setDrafts((current) => current.filter((row) => row.key !== key))
    setItems((current) => [...current, result.media])
    setPendingFor(result.media.id, result.pendingDigits)
    void refreshPlates()
    show(draft.kind === 'video' ? EVENT_MEDIA_VIDEO_ADDED : EVENT_MEDIA_ADDED, 'done')
  }

  async function refreshPlates() {
    const rows = await source.listPlates(eventId)
    setPlates(rows)
    setPlatesLoaded(true)
  }

  function applySubject(
    mediaId: string,
    subject: PhotoSubject,
    saved: { ids: string[]; pendingDigits: string[] },
    patch: Partial<EventMedia> = {},
  ) {
    setItems((current) =>
      current.map((row) =>
        row.id === mediaId
          ? {
              ...row,
              ...patch,
              treated_plate_ids: saved.ids,
              not_vehicle: subject.kind === 'not_vehicle',
            }
          : row,
      ),
    )
    setPendingFor(mediaId, saved.pendingDigits)
    void refreshPlates()
  }

  function openLink(item: EventMedia) {
    setLinkTarget(item)
    setLinkSubject(subjectOf(item))
    setLinkError(undefined)
  }

  async function onSaveLink() {
    if (!linkTarget) return
    setSavingLink(true)
    const result = await source.setSubject({
      eventId,
      mediaId: linkTarget.id,
      subject: linkSubject,
      owner,
    })
    setSavingLink(false)
    if (!result.ok) {
      setLinkError(result.error)
      return
    }
    applySubject(linkTarget.id, linkSubject, result)
    setLinkTarget(null)
    show(PLATE_LINK_SAVED, 'done')
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
    const next: MediaDraft[] = accepted.map((file) => {
      const heic = isHeicFile(file)
      return {
        key: crypto.randomUUID(),
        kind: eventMediaKind(file) ?? 'image',
        file,
        previewUrl: heic ? '' : URL.createObjectURL(file),
        takenWhen: '',
        subject: PHOTO_UNASSIGNED,
        caption: '',
        uploading: false,
        preparing: heic,
      }
    })
    setDrafts((current) => [...current, ...next])
    void refreshPlates()
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
    setEditSubject(subjectOf(item))
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
    const caption = editCaption.trim() || null
    const result = await source.setSubject({
      eventId,
      mediaId: viewer.id,
      subject: editSubject,
      owner,
      takenWhen: editTakenWhen,
      caption,
    })
    setSavingEdit(false)
    if (!result.ok) {
      setEditError(result.error)
      show(result.error, 'alert')
      return
    }
    const patch = { taken_when: editTakenWhen, caption }
    applySubject(viewer.id, editSubject, result, patch)
    setViewer({
      ...viewer,
      ...patch,
      treated_plate_ids: result.ids,
      not_vehicle: editSubject.kind === 'not_vehicle',
    })
    setEditing(false)
    show(EVENT_MEDIA_UPDATED, 'done')
  }

  async function onDelete() {
    if (!viewer) return
    setDeleting(true)
    const result = await source.remove(viewer)
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
        vehiclesReady,
      })
    : false
  const stepVehicleNote = vehiclesReady ? photoStepVehicleNote(vehicleOptions.length) : null
  // A form vehicle with no saved row yet: the link is made when the report is saved.
  const stepPending =
    stepDraft?.subject.kind === 'vehicles' &&
    platesLoaded &&
    resolvePlateDigits(plates, stepDraft.subject.digits, owner).missing.length > 0

  function saveStep() {
    const draft = draftsRef.current[0]
    if (!draft) return
    if (draft.takenWhen !== 'before_treatment' && draft.takenWhen !== 'during_after_treatment') return
    if (
      !photoStepCanSave({
        caption: draft.caption,
        takenWhen: draft.takenWhen,
        preparing: Boolean(draft.preparing),
        vehiclesReady,
      })
    ) {
      return
    }
    void startUpload(
      draft.key,
      draft.takenWhen,
      photoAttachWrite({ caption: draft.caption, subject: draft.subject }),
    )
  }

  const ownViewer = Boolean(viewer && canDeleteEventMedia(viewer, viewerId, canWrite))
  const linkedPlates = viewer
    ? plates.filter((plate) => viewer.treated_plate_ids.includes(plate.id))
    : []
  const viewerPending: VehicleOption[] = viewer
    ? vehicleOptions.filter((vehicle) => (pending[viewer.id] ?? []).includes(vehicle.digits))
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
                {!vehiclesReady ? (
                  <p className="t-caption text-muted">טוען רכבים…</p>
                ) : (
                  <>
                    <PhotoSubjectChips
                      single
                      vehicles={vehicleOptions}
                      value={stepDraft.subject}
                      disabled={stepDraft.uploading}
                      onChange={(subject) => patchDraft(stepDraft.key, { subject })}
                    />
                    {stepVehicleNote ? (
                      <p className="field__hint">{stepVehicleNote}</p>
                    ) : stepPending ? (
                      <p className="field__hint">{EVENT_MEDIA_PENDING_VEHICLE}</p>
                    ) : null}
                  </>
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
                { label: PLATE_LINK_ACTION, onSelect: () => openLink(tileMenu.item) },
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
                  <PhotoSubjectChips
                    vehicles={vehicleOptions}
                    value={editSubject}
                    onChange={setEditSubject}
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
                        {linkedPlates.length > 0 || viewerPending.length > 0 ? (
                          <ul className="event-media__plate-list">
                            {linkedPlates.map((plate) => (
                              <li key={plate.id}>
                                <MediaPlateChoice plate={plate} />
                              </li>
                            ))}
                            {viewerPending.map((vehicle) => (
                              <li key={vehicle.digits}>
                                <MediaPlateChoice plate={vehicle} />
                                <span className="t-caption text-muted">ישויך כשתשמרו את הדיווח</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="t-body">{EVENT_MEDIA_UNASSIGNED_LABEL}</span>
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
          <PhotoSubjectChips
            vehicles={vehicleOptions}
            value={linkSubject}
            disabled={savingLink}
            onChange={(subject) => {
              setLinkSubject(subject)
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
