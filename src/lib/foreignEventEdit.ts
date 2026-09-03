export const FOREIGN_EVENT_EDIT_BODY = 'כל שינוי שתבצע יתועד ויישמר במערכת'
export const FOREIGN_EVENT_EDIT_CONFIRM = 'עריכה'
export const FOREIGN_EVENT_EDIT_CANCEL = 'ביטול'
export const FOREIGN_EVENT_EDIT_LEAD_FALLBACK = 'אחמ״ש אחר'

export function isForeignShiftLeadEvent(input: {
  viewerId: string | undefined | null
  shiftLeadId: string | undefined | null
}): boolean {
  const viewerId = input.viewerId?.trim() ?? ''
  const shiftLeadId = input.shiftLeadId?.trim() ?? ''
  return Boolean(viewerId && shiftLeadId && viewerId !== shiftLeadId)
}

export function foreignEventEditLeadName(lead: {
  full_name?: string | null
  callsign?: string | null
}): string {
  const name = lead.full_name?.trim() ?? ''
  if (name) return name
  const callsign = lead.callsign?.trim() ?? ''
  return callsign || FOREIGN_EVENT_EDIT_LEAD_FALLBACK
}

export function foreignEventEditTitle(leadName: string): string {
  return `האם אתה בטוח שברצונך לערוך אירוע שהוזן על ידי ${leadName}?`
}
