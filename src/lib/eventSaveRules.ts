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
import { PATROL_CALLSIGN_NUMBER_ERROR } from './patrolCallsign'
import {
  validateResponderFillDraft,
  type ResponderFillDraft,
  type ResponderFillErrors,
} from './responderFill'
import {
  VEHICLE_PHOTOS_PROCEED,
  VEHICLE_PHOTOS_TITLE,
  vehiclesMissingPhotos,
} from './eventVehiclePhotos'
import type { TreatedPlate } from './treatedPlates'

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

  if (!input.allowPartial && !input.draft.patrol_callsign_number.trim()) {
    const already = persistErrors.patrol_callsign_number
    if (!already) {
      const fieldErrors = { patrol_callsign_number: PATROL_CALLSIGN_NUMBER_ERROR }
      blocks.push({
        id: 'callsign_number',
        severity: 'block',
        title: PATROL_CALLSIGN_NUMBER_ERROR,
        message: PATROL_CALLSIGN_NUMBER_ERROR,
        field: 'patrol_callsign_number',
        fieldErrors,
      })
    }
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
  coveredPlateDigits: Set<string>
  photoNotifyOk?: boolean
}): SaveRulesResult {
  const blocks: SaveRuleIssue[] = []
  const notifies: SaveRuleIssue[] = []

  const fieldErrors = validateResponderFillDraft(
    input.draft,
    input.mode,
    input.allowedPlates,
    input.totalKm,
    input.unfinishedMediaDraftCount ?? 0,
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

  if (!input.photoNotifyOk) {
    const missing = vehiclesMissingPhotos(input.draft.treated_plates, input.coveredPlateDigits)
    if (missing.length > 0) {
      notifies.push({
        id: 'vehicle_photos',
        severity: 'notify',
        title: VEHICLE_PHOTOS_TITLE,
        message: VEHICLE_PHOTOS_TITLE,
        proceedLabel: VEHICLE_PHOTOS_PROCEED,
        vehicles: missing,
      })
    }
  }

  return { blocks, notifies }
}

export function mergeFieldErrors(issues: SaveRuleIssue[]): EventFormErrors & ResponderFillErrors {
  const merged: EventFormErrors & ResponderFillErrors = {}
  for (const issue of issues) {
    if (issue.fieldErrors) Object.assign(merged, issue.fieldErrors)
  }
  return merged
}
