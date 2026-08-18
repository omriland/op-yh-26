/** Event-detail responder cards: start open only for the viewer's own row. */
export function responderCardStartsOpen(input: {
  isViewer: boolean
  manages: boolean
}): boolean {
  if (input.manages) return false
  return input.isViewer
}

/** מד אוץ on someone else's card is lead/admin only. Own card stays visible. */
export function responderCardShowsOdometers(input: {
  isViewer: boolean
  manages: boolean
}): boolean {
  return input.manages || input.isViewer
}
