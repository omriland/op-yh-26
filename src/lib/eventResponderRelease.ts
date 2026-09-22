/** Manual events stay off the responder until the lead enters מספר אירוע. */
export function eventReleasedToResponders(input: {
  origin?: string | null
  policeEventId?: string | null
}): boolean {
  if (input.origin === 'shift') return true
  return Boolean(input.policeEventId?.trim())
}
