import {
  canPersistEventDraft,
  eventCreateBlockedMessage,
  FUTURE_EVENT_DATE_CONTINUE,
  FUTURE_EVENT_DATE_TITLE,
  isOvernightEnd,
  shouldConfirmFutureEventDate,
  validateCancelledSave,
  type EventFormDraft,
  type EventFormErrors,
  type LookupOption,
} from './eventForm'
import { ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR } from './assignedVolunteerEventEdit'
import { EVENT_EDIT_LOCKED_TOOLTIP, isEventEditAgeLocked } from './eventEditLock'
import {
  validateResponderFillDraft,
  type ResponderFillDraft,
  type ResponderFillErrors,
} from './responderFill'
import {
  VEHICLE_PHOTOS_PROCEED,
  VEHICLE_PHOTOS_TITLE,
  unlinkedPhotosNote,
  vehiclesMissingPhotos,
} from './eventVehiclePhotos'
import type { TreatedPlate } from './treatedPlates'
import { plateDigits } from './format'

export type SaveRuleSeverity = 'block' | 'notify'

export type SaveRuleIssue = {
  id: string
  severity: SaveRuleSeverity
  title: string
  message: string
  proceedLabel?: string
  field?: keyof EventFormErrors | keyof ResponderFillErrors
  fieldErrors?: EventFormErrors | ResponderFillErrors
  vehicles?: TreatedPlate[]
  /** A line under the vehicle list (the photo prompt's unlinked-photos note). */
  note?: string
}

export type SaveRulesResult = {
  blocks: SaveRuleIssue[]
  notifies: SaveRuleIssue[]
}

export const OVERNIGHT_END_TITLE = 'סיום ביום למחרת'
export const OVERNIGHT_END_MESSAGE = 'זמן הסיום מוקדם מזמן ההתחלה. האם האירוע מסתיים ביום למחרת?'
export const OVERNIGHT_END_PROCEED = 'כן, מסתיים למחרת'
export const SAVE_RULES_BACK = 'חזרה לעריכה'
export const SAVE_RULES_PROCEED_DEFAULT = 'להמשיך'

export function firstBlockMessage(result: SaveRulesResult): string | undefined {
  return result.blocks[0]?.message
}

export function evaluateEventFormSaveRules(input: {
  draft: EventFormDraft
  districts: LookupOption[]
  roads?: LookupOption[]
  allowPartial?: boolean
  roles?: readonly string[]
  canClearCancelled: boolean
  previousIsCancelled: boolean
  treatedTotal: number
  assignedVolunteerBlocked?: boolean
  futureDateOk?: boolean
  overnightOk?: boolean
  lastSavedDate: string
  today?: string
}): SaveRulesResult {
  const blocks: SaveRuleIssue[] = []
  const notifies: SaveRuleIssue[] = []

  if (input.assignedVolunteerBlocked) {
    blocks.push({
      id: 'assigned_volunteer',
      severity: 'block',
      title: ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR,
      message: ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR,
    })
  }

  if (
    input.draft.id &&
    isEventEditAgeLocked({ createdAt: input.draft.created_at, roles: input.roles })
  ) {
    blocks.push({
      id: 'edit_age_lock',
      severity: 'block',
      title: EVENT_EDIT_LOCKED_TOOLTIP,
      message: EVENT_EDIT_LOCKED_TOOLTIP,
    })
  }

  const persistErrors = canPersistEventDraft(input.draft, input.districts, {
    allowPartial: input.allowPartial,
    roads: input.roads,
  })
  if (Object.keys(persistErrors).length > 0) {
    blocks.push({
      id: 'event_minimum',
      severity: 'block',
      title: eventCreateBlockedMessage(persistErrors),
      message: eventCreateBlockedMessage(persistErrors),
      fieldErrors: persistErrors,
    })
  }

  const cancelled = validateCancelledSave({
    is_cancelled: input.draft.is_cancelled,
    treatedTotal: input.treatedTotal,
    canClearCancelled: input.canClearCancelled,
    previousIsCancelled: input.previousIsCancelled,
  })
  if (cancelled) {
    blocks.push({
      id: 'cancelled',
      severity: 'block',
      title: cancelled.form ?? '',
      message: cancelled.form ?? '',
      fieldErrors: cancelled,
    })
  }

  if (
    !input.futureDateOk &&
    shouldConfirmFutureEventDate({
      eventDate: input.draft.event_date,
      lastSavedDate: input.lastSavedDate,
      today: input.today,
    })
  ) {
    notifies.push({
      id: 'future_date',
      severity: 'notify',
      title: FUTURE_EVENT_DATE_TITLE,
      message: FUTURE_EVENT_DATE_TITLE,
      proceedLabel: FUTURE_EVENT_DATE_CONTINUE,
    })
  }

  if (
    !input.overnightOk &&
    isOvernightEnd(input.draft.start_time, input.draft.end_time)
  ) {
    notifies.push({
      id: 'overnight_end',
      severity: 'notify',
      title: OVERNIGHT_END_TITLE,
      message: OVERNIGHT_END_MESSAGE,
      proceedLabel: OVERNIGHT_END_PROCEED,
    })
  }

  return { blocks, notifies }
}

export function evaluateResponderFillSaveRules(input: {
  draft: ResponderFillDraft
  mode: 'draft' | 'complete'
  allowedPlates?: string[]
  totalKm?: number | null
  unfinishedMediaDraftCount?: number
  /** Null when coverage is unknown (read failed, or no gallery): no photo prompt. */
  coveredPlateDigits: ReadonlySet<string> | null
  /** Vehicles the person already chose to save without a photo. */
  photoSkippedDigits?: ReadonlySet<string>
  /** The person's own saved photos with no vehicle. */
  unlinkedPhotoCount?: number
  cancelled?: boolean
}): SaveRulesResult {
  const blocks: SaveRuleIssue[] = []
  const notifies: SaveRuleIssue[] = []

  const fieldErrors = validateResponderFillDraft(
    input.draft,
    input.mode,
    input.allowedPlates,
    input.totalKm,
    input.unfinishedMediaDraftCount ?? 0,
    input.cancelled ?? false,
  )
  if (Object.keys(fieldErrors).length > 0) {
    const message =
      fieldErrors.form ??
      fieldErrors.treated_plates ??
      fieldErrors.event_media ??
      fieldErrors.vehicle_plate ??
      fieldErrors.odometer_start ??
      fieldErrors.odometer_end ??
      fieldErrors.route ??
      fieldErrors.treatment_detail ??
      'יש לתקן את השדות המסומנים.'
    blocks.push({
      id: 'fill_fields',
      severity: 'block',
      title: message,
      message,
      fieldErrors,
    })
  }

  const photos = vehiclePhotosIssue(
    input.draft.treated_plates,
    input.coveredPlateDigits,
    input.photoSkippedDigits,
    input.unlinkedPhotoCount ?? 0,
  )
  if (photos) notifies.push(photos)

  return { blocks, notifies }
}

/**
 * The "no photo for these vehicles" prompt, or null. A vehicle the person already
 * skipped is not asked about again; one added after that is.
 */
export function vehiclePhotosIssue(
  plates: readonly TreatedPlate[],
  covered: ReadonlySet<string> | null,
  skipped: ReadonlySet<string> = new Set(),
  unlinkedPhotoCount = 0,
): SaveRuleIssue | null {
  if (!covered) return null
  const missing = vehiclesMissingPhotos(plates, covered).filter(
    (plate) => !skipped.has(plateDigits(plate.plate_number)),
  )
  if (missing.length === 0) return null
  return {
    id: 'vehicle_photos',
    severity: 'notify',
    title: VEHICLE_PHOTOS_TITLE,
    message: VEHICLE_PHOTOS_TITLE,
    proceedLabel: VEHICLE_PHOTOS_PROCEED,
    vehicles: missing,
    note: unlinkedPhotosNote(unlinkedPhotoCount) ?? undefined,
  }
}

/** Plate digits of the vehicles a photo prompt named, to remember once the person skips. */
export function skippedPhotoDigits(issues: readonly SaveRuleIssue[]): string[] {
  return issues.flatMap((issue) =>
    (issue.vehicles ?? []).map((plate) => plateDigits(plate.plate_number)).filter(Boolean),
  )
}

export function mergeFieldErrors(issues: SaveRuleIssue[]): EventFormErrors & ResponderFillErrors {
  const merged: EventFormErrors & ResponderFillErrors = {}
  for (const issue of issues) {
    if (issue.fieldErrors) Object.assign(merged, issue.fieldErrors)
  }
  return merged
}
