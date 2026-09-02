export type SetPasswordPeer = {
  id: string
  full_name: string
  email: string
  callsign: string
  active: boolean
}

export function setPasswordTargetIdentity(target: SetPasswordPeer): string {
  return `${target.full_name} · ${target.email} · או״ק ${target.callsign}`
}

export function setPasswordTargetWarnings(
  target: SetPasswordPeer,
  users: SetPasswordPeer[],
): string[] {
  const warnings: string[] = []
  if (!target.active) {
    warnings.push('משתמש זה מושבת. הגדרת הסיסמה לא תפעיל אותו.')
  }

  const peers = users.filter(
    (user) =>
      user.id !== target.id &&
      (user.full_name === target.full_name || user.callsign === target.callsign),
  )
  if (peers.length === 0) return warnings

  const listed = peers
    .map((peer) => {
      const state = peer.active ? 'פעיל' : 'מושבת'
      return `${peer.full_name} · ${peer.email} · או״ק ${peer.callsign} (${state})`
    })
    .join(', ')
  warnings.push(`קיים חשבון נוסף עם אותו שם או או״ק: ${listed}. ודאו שזה החשבון הנכון.`)
  return warnings
}
