/** Block אחמ״ש/admin event-form edit when the viewer is assigned on that event. */
export const ASSIGNED_VOLUNTEER_EVENT_EDIT_ERROR =
  'לא ניתן לערוך אירוע עליו אתה מוצב כמתנדב. לעדכון פרטים יש לפנות לאחמ"ש המזין או למנהל מערכת'

export const ASSIGNED_VOLUNTEER_EVENT_EDIT_CLOSE = 'סגירה'

function sameUser(
  viewerId: string | undefined | null,
  otherId: string | undefined | null,
): boolean {
  const viewer = viewerId?.trim() ?? ''
  const other = otherId?.trim() ?? ''
  return Boolean(viewer && other && viewer === other)
}

/**
 * True when the viewer has an `event_responders` row or is a secondary אחמ״ש.
 * Role (including admin / super_admin combo) does not bypass — they fill as a
 * volunteer instead of opening the event editor. Main-only lead is not blocked.
 */
export function isAssignedVolunteerEventEditBlocked(input: {
  viewerId?: string | null
  responderIds?: readonly (string | null | undefined)[]
  secondaryLeadIds?: readonly (string | null | undefined)[]
}): boolean {
  const viewerId = input.viewerId
  if ((input.responderIds ?? []).some((id) => sameUser(viewerId, id))) return true
  if ((input.secondaryLeadIds ?? []).some((id) => sameUser(viewerId, id))) return true
  return false
}
