/** Event-detail responder cards: start open only for the viewer's own row. */
export function responderCardStartsOpen(input: {
  isViewer: boolean
  manages: boolean
}): boolean {
  if (input.manages) return false
  return input.isViewer
}

/**
 * Whether the viewer sees this event through a management lens.
 *
 * A אחמ״ש manages only the events they actually lead. A מנהל audits every
 * event, so being assigned as a כונן on one must not demote them — that is what
 * silently stripped מד אוץ and lead KM from admins.
 */
export function viewerManagesEvent(input: {
  isEventLead: boolean
  isAdmin: boolean
}): boolean {
  return input.isEventLead || input.isAdmin
}

/** View-only lead KM on event detail — hidden from responder-only viewers. */
export const LEAD_KM_VIEW_LABEL = 'ק״מ (אחמ״ש)'

/**
 * Lead KM is refund data. A כונן-only viewer never sees it. Any other role
 * (אחמ״ש / מנהל / מנהל־על) always does, including when they are also assigned.
 */
export function responderCardShowsLeadKm(input: { hasLeadRole: boolean }): boolean {
  return input.hasLeadRole
}

/** מד אוץ on someone else's card is lead/admin only. Own card stays visible. */
export function responderCardShowsOdometers(input: {
  isViewer: boolean
  manages: boolean
}): boolean {
  return input.manages || input.isViewer
}
