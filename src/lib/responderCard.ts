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

/**
 * Lead KM is refund data, so a כונן never sees a teammate's. A lead-role viewer
 * who is participating in an event they do not lead reads it as a participant.
 */
export function responderCardShowsLeadKm(input: {
  managesEvent: boolean
  hasLeadRole: boolean
  assignedAsResponder: boolean
}): boolean {
  return input.managesEvent || (input.hasLeadRole && !input.assignedAsResponder)
}

/** מד אוץ on someone else's card is lead/admin only. Own card stays visible. */
export function responderCardShowsOdometers(input: {
  isViewer: boolean
  manages: boolean
}): boolean {
  return input.manages || input.isViewer
}
