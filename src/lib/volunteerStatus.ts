export type VolunteerStatus =
  | 'administration'
  | 'basic_training'
  | 'phone_training'
  | 'personal_vehicle_training'
  | 'shifts_only'
  | 'active_volunteer'

export const DEFAULT_VOLUNTEER_STATUS: VolunteerStatus = 'active_volunteer'

export const VOLUNTEER_STATUS_LABELS: Record<VolunteerStatus, string> = {
  administration: 'מנהלה',
  basic_training: 'חניכה בסיסית',
  phone_training: 'חניכה טלפונית',
  personal_vehicle_training: 'חניכה ברכב פרטי',
  shifts_only: 'משמרות בלבד',
  active_volunteer: 'מתנדב פעיל',
}

export const VOLUNTEER_STATUS_OPTIONS: { value: VolunteerStatus; label: string }[] = [
  { value: 'administration', label: VOLUNTEER_STATUS_LABELS.administration },
  { value: 'basic_training', label: VOLUNTEER_STATUS_LABELS.basic_training },
  { value: 'phone_training', label: VOLUNTEER_STATUS_LABELS.phone_training },
  { value: 'personal_vehicle_training', label: VOLUNTEER_STATUS_LABELS.personal_vehicle_training },
  { value: 'shifts_only', label: VOLUNTEER_STATUS_LABELS.shifts_only },
  { value: 'active_volunteer', label: VOLUNTEER_STATUS_LABELS.active_volunteer },
]

const VOLUNTEER_STATUS_VALUES = new Set<string>(
  VOLUNTEER_STATUS_OPTIONS.map((option) => option.value),
)

export function isVolunteerStatus(value: unknown): value is VolunteerStatus {
  return typeof value === 'string' && VOLUNTEER_STATUS_VALUES.has(value)
}

export function parseVolunteerStatus(value: unknown): VolunteerStatus {
  return isVolunteerStatus(value) ? value : DEFAULT_VOLUNTEER_STATUS
}

export function volunteerStatusLabel(value: unknown): string {
  return VOLUNTEER_STATUS_LABELS[parseVolunteerStatus(value)]
}

const MAP_HIDDEN_VOLUNTEER_STATUSES = new Set<VolunteerStatus>([
  'administration',
  'basic_training',
  'shifts_only',
])

/** Hidden on unit/cockpit maps: מנהלה, חניכה בסיסית, משמרות בלבד. */
export function isMapVisibleVolunteerStatus(value: unknown): boolean {
  return !MAP_HIDDEN_VOLUNTEER_STATUSES.has(parseVolunteerStatus(value))
}
